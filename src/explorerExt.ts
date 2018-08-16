import * as vs from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as mkdirp from 'mkdirp';
import * as rimraf from "rimraf";

namespace _{

    function handleResult<T>(
        resolve:(result: T) => void, 
        reject: (error:Error)=> void, 
        error: Error|null|undefined,
        result:T
    ):void{
        if(error){
            reject(messageError(error));
        }else{
           resolve(result);
        }
    }

    function messageError(error: Error & {code?:string}): Error{
        if (error.code === 'ENOENT') {
			return vs.FileSystemError.FileNotFound();
		}

		if (error.code === 'EISDIR') {
			return vs.FileSystemError.FileIsADirectory();
		}

		if (error.code === 'EEXIST') {
			return vs.FileSystemError.FileExists();
		}

		if (error.code === 'EPERM' || error.code === 'EACCESS') {
			return vs.FileSystemError.NoPermissions();
		}

		return error;
    }

    export function exists(path:string):Promise<boolean>{
        return new Promise<boolean>((resolve,reject)=>{
            fs.exists(path,exists=>handleResult(resolve,reject, null, exists));
        });
    }

    export function stat(path: string): Promise<fs.Stats> {
		return new Promise<fs.Stats>((resolve, reject) => {
			fs.stat(path, (error, stat) => handleResult(resolve, reject, error, stat));
		});
    }
    
    export function readdir(path:string):Promise<string[]>{
        return new Promise<string[]>((resolve,reject)=>{
            fs.readdir(path,(error,children)=> handleResult(resolve,reject,error,children.map((value)=>value.normalize("NFC"))));
        });
    }

    export function mkdir(path: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			mkdirp(path, error => handleResult(resolve, reject, error, void 0));
		});
    }
    
    export function rmrf(path:string):Promise<void>{
        return new Promise<void>((resolve,reject)=>{
            rimraf(path,error=> handleResult(resolve,reject,error,void 0));
        });
    }

    export function readfile(path:string):Promise<Buffer>{
        return new Promise<Buffer>((resolve,reject)=>{
            fs.readFile(path,(error,buffer)=> handleResult(resolve,reject,error,buffer));
        });
    }

    export function unlink(path:string):Promise<void>{
        return new Promise<void>((resolve,reject)=>{
            fs.unlink(path,error=>handleResult(resolve,reject,error,void 0));
        });
    }

    export function rename(oldPath:string, newPath:string): Promise<void>{
        return new Promise<void>((resolve,reject)=>{
            fs.rename(oldPath,newPath,error=> handleResult(resolve,reject,error,void 0));
        });
    }
}

export class ExplorerExtProvider implements vs.TreeDataProvider<Entry>, vs.FileSystemProvider{
    private hideRules:{};
    //FileSystemProvider

    private _onDidChangeFile: vs.EventEmitter<vs.FileChangeEvent[]>;
    
    constructor(){
        this._onDidChangeFile= new vs.EventEmitter<vs.FileChangeEvent[]>();

        const hideRules=vs.workspace.getConfiguration("explorerExt").get("hideRules");
        if(hideRules){
            this.hideRules=hideRules;
        }else{
            this.hideRules={};
        }
    }
    
    get onDidChangeFile(): vs.Event<vs.FileChangeEvent[]>{
        return this._onDidChangeFile.event;
    }

    watch(
        uri: vs.Uri,
        options:{ recursive: boolean; excludes: string[]; }
    ): vs.Disposable{
        const watcher=fs.watch(uri.fsPath,{recursive:options.recursive}, async (event: string, filename: string|Buffer)=>{
            const filepath=path.join(uri.fsPath, filename.toString().normalize("NFC"));

            this._onDidChangeFile.fire([{
                type:(event === 'change') ? 
                    (vs.FileChangeType.Changed): 
                    (await _.exists(filepath)? 
                        vs.FileChangeType.Created:
                        vs.FileChangeType.Deleted),
                uri: uri.with({path:filepath})
            } as vs.FileChangeEvent]);
        });

        return {dispose: ()=> watcher.close()};
    }

    stat(uri: vs.Uri): vs.FileStat | Thenable<vs.FileStat> {
		return this._stat(uri.fsPath);
	}

	async _stat(path: string): Promise<vs.FileStat> {
		return new FileStat(await _.stat(path));
	}


    readDirectory(uri: vs.Uri): [string, vs.FileType][] | Thenable<[string, vs.FileType][]> {
        return this._readDirectory(uri);
    }
    async _readDirectory(uri:vs.Uri):Promise<[string,vs.FileType][]>{
        const children= await _.readdir(uri.fsPath);

        const result:[string, vs.FileType][]=[];
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            const stat=await this._stat(path.join(uri.fsPath,child));
            result.push([child,stat.type]);
        }
        return Promise.resolve(result);
    }

    createDirectory(uri: vs.Uri): void | Thenable<void> {
        return _.mkdir(uri.fsPath);
    }

    readFile(uri: vs.Uri): Uint8Array | Thenable<Uint8Array> {
        return _.readfile(uri.fsPath);
    }

    writeFile(
        uri: vs.Uri, 
        content: Uint8Array, 
        options: { create: boolean; overwrite: boolean; }
    ): void | Thenable<void> {
        return this._writeFile(uri,content,options);
    }
    async _writeFile(
        uri:vs.Uri,
        content:Uint8Array,
        options:{create:boolean; overwrite:boolean;}
    ):Promise<void>{
        const exists= await _.exists(uri.fsPath);
        if (!exists){
            if(!options.create){
                throw vs.FileSystemError.FileNotFound();
            }

            await _.mkdir(path.dirname(uri.fsPath));
        }else{
            if(!options.overwrite){
                throw vs.FileSystemError.FileExists();
            }
        }
    }

    delete(
        uri: vs.Uri, 
        options: { recursive: boolean; }
    ): void | Thenable<void> {
        if(options.recursive){
            return _.rmrf(uri.fsPath);
        }
        return _.unlink(uri.fsPath);
    }

    rename(
        oldUri: vs.Uri, 
        newUri: vs.Uri, 
        options: { overwrite: boolean; }
    ): void | Thenable<void> {
        return this._rename(oldUri,newUri,options);
    }
    async _rename(oldUri:vs.Uri,
        newUri:vs.Uri,
        options:{overwrite: boolean;}
    ):Promise<void>{
        const exists=await _.exists(newUri.fsPath);
        if(exists){
            if(!options.overwrite){
                throw vs.FileSystemError.FileExists();
            }else{
                await _.rmrf(newUri.fsPath);
            }
        }

        const parentExists=await _.exists(path.dirname(newUri.fsPath));
        if(!parentExists){
            await _.mkdir(path.dirname(newUri.fsPath));
        }

        return _.rename(oldUri.fsPath,newUri.fsPath);
    }
    
    //TreeDataProvider
    getHideMap(files:[string,vs.FileType][]):HideMapItem[]{
        const out:HideMapItem[]=[];
        for (let i = 0; i < files.length; i++) {
            const hi =this.getHideMapItem(files[i]);
            if(hi){
                out.push(hi);
            }
        }
        console.log("hides:");
        console.log(out);
        return out;
    }
    getHideMapItem(file:[string,vs.FileType]):HideMapItem|undefined{
        if(file[1]!==vs.FileType.Directory){
            const sepName=file[0].split(".");
            const ext=sepName[sepName.length-1];
            //@ts-ignore
            if(this.hideRules[ext]){
                return {
                    base:file[0].slice(0,file[0].length-ext.length),
                    conEnd:ext,
                    //@ts-ignore
                    end:this.hideRules[ext]
                };
            }
        }
        return;
    }

    async generateItemList(parentDir:vs.Uri):Promise<Entry[]>{
        const files=await this.readDirectory(parentDir);
        files.sort((a,b)=>{
            if (a[1]===b[1]){
                return a[0].localeCompare(b[0]);
            }
            return a[1]===vs.FileType.Directory ? -1:1;
        });

        const hideMap=this.getHideMap(files);

        const out:Entry[]=[];
        mainLoop:
        for (let i = 0; i < files.length; i++) {
            const f = files[i];
            //if is directory
            if(f[1]===vs.FileType.Directory){
                out.push({
                    uri: vs.Uri.file(path.join(parentDir.fsPath,f[0])),
                    type:vs.FileType.Directory
                });
                continue;
            }
            let isVContainer=undefined;
            //for each hideRuleItem
            for (let j = 0; j < hideMap.length; j++) {
                const hm = hideMap[j];
                const ext=f[0].slice(hm.base.length);
                if(f[0].startsWith(hm.base)){
                    //check if is hidden
                    for (let k = 0; k < hm.end.length; k++) {
                        const e = hm.end[k];
                        if(ext===e){
                            hm.contains=true;
                            continue mainLoop;
                        }
                    }
                    //if vContainer
                    if(ext===hm.conEnd){
                        isVContainer=hm;
                    }
                }
            }
            out.push({
                uri: vs.Uri.file(path.join(parentDir.fsPath,f[0])),
                type:f[1],
                hideMapItem:isVContainer
            });
            
        }
        return out;
    }
    async generateVItemList(vContainer:Entry):Promise<Entry[]>{
        const parentDir=vContainer.uri.fsPath.slice(0,vContainer.uri.fsPath.lastIndexOf("\\"));
        const p=vs.Uri.file(parentDir);
        const files=await this.readDirectory(p);
        const hideMap=this.getHideMap(files);
        const currHi=vContainer.hideMapItem;
        if(!currHi){return [];}

        const out:Entry[]=[];
        mainLoop:
        for (let i = 0; i < files.length; i++) {
            const f = files[i];

            if(f[1]===vs.FileType.Directory){
                continue;
            }
            //check if currContainer
            if(f[0]===currHi.base+currHi.conEnd){
                continue;
            }

            //check if Container
            let isVContainer=undefined;
            for (let j = 0; j < hideMap.length; j++) {
                const hi = hideMap[j];
                if(f[0]===hi.base+hi.conEnd){
                    isVContainer=hi;
                    break;
                }
            }

            //get hiddens of currHi
            if(f[0].startsWith(currHi.base)){
                for (let j = 0; j < currHi.end.length; j++) {
                    const e = currHi.end[j];
                    if(f[0]===currHi.base+e){
                        out.push({
                            uri:vs.Uri.file(path.join(parentDir,f[0])),
                            type:f[1],
                            hideMapItem:isVContainer
                        });
                        continue mainLoop;
                    }
                }
            }

            //check wich vContainers are empty
            for (let j = 0; j < hideMap.length; j++) {
                const hi = hideMap[j];
                for(let k=0;k<hi.end.length;k++){
                    const e=hi.end[k];
                    if(f[0]===hi.base+e){
                        hi.contains=true;
                        continue;
                    }

                }
            }
            
            
        }
        return out;
    }
    getChildren(element?: Entry): Promise<Entry[]> {
        if(element){
            if(element.hideMapItem&&element.hideMapItem.contains){
                console.log("tried opening vContainer");
                return this.generateVItemList(element);
            }
            return this.generateItemList(element.uri);
        }
        if(vs.workspace.workspaceFolders){
            const workspaceFolder=vs.workspace.workspaceFolders.filter(folder => folder.uri.scheme==='file')[0];
            if(workspaceFolder){
                return this.generateItemList(workspaceFolder.uri);
            }
        }
        return new Promise<Entry[]>(resolve=>resolve([]));
    }

    getTreeItem(element: Entry): ExtItem {
        if(element.hideMapItem){
            console.log(element);
        }
        const treeItem=new ExtItem(
            element.uri,
            element.type===vs.FileType.Directory||(element.hideMapItem&&element.hideMapItem.contains)?
                vs.TreeItemCollapsibleState.Collapsed:
                vs.TreeItemCollapsibleState.None,
                (element.hideMapItem&&element.hideMapItem.contains)==true
        );
        if(element.type===vs.FileType.File){
            treeItem.command={command: 'explorerExt.openFile',title:"Open File", arguments:[element.uri],};
            treeItem.contextValue='file';
        }
        return treeItem;
    }
}

interface Entry{
    uri:vs.Uri;
    type: vs.FileType;
    hideMapItem?:HideMapItem;
}

class ExtItem extends vs.TreeItem{
    constructor(
        public readonly resourceUri: vs.Uri,
        public readonly collapsibleState: vs.TreeItemCollapsibleState,
        public readonly virtual:boolean
        
    ){
        super(resourceUri,collapsibleState);
        if(virtual){
            this.iconPath=vs.ThemeIcon.File;
        }
    }
    
    get tooltip():string{
        //TODO:
        
        return this.resourceUri.fsPath;
    }

}

interface HideMapItem{
    /**
     * basename without extension
     */
    base:string;
    /**
     * list of endings to be hidden
     */
    end:string[];
    /**
     * ending of the virtual container file
     */
    conEnd:string;
    /**
     * if there are any files to be contained
     */
    contains?:boolean;
}

export class FileStat implements vs.FileStat {

	constructor(public fsStat: fs.Stats) { }

	get type(): vs.FileType {
        return (this.fsStat.isFile()) ? 
                    (vs.FileType.File) : 
                    (this.fsStat.isDirectory() ? 
                        vs.FileType.Directory : 
                        (this.fsStat.isSymbolicLink() ? 
                            vs.FileType.SymbolicLink : 
                            vs.FileType.Unknown));
	}

	get isFile(): boolean | undefined {
		return this.fsStat.isFile();
	}

	get isDirectory(): boolean | undefined {
		return this.fsStat.isDirectory();
	}

	get isSymbolicLink(): boolean | undefined {
		return this.fsStat.isSymbolicLink();
	}

	get size(): number {
		return this.fsStat.size;
	}

	get ctime(): number {
		return this.fsStat.ctime.getTime();
	}

	get mtime(): number {
		return this.fsStat.mtime.getTime();
	}
}