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
interface Entry{
    uri:vs.Uri,
    type: vs.FileType
}
export class ExplorerExtProvider implements vs.TreeDataProvider<Entry>, vs.FileSystemProvider{
    
    //FileSystemProvider

    private _onDidChangeFile: vs.EventEmitter<vs.FileChangeEvent[]>;
    
    constructor(){
        this._onDidChangeFile= new vs.EventEmitter<vs.FileChangeEvent[]>();
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
    async _stat(path: string):Promise<vs.FileStat>{
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

    createDirectory(uri: vs.Uri): void | Thenable<void> {6
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

    

    async getChildren(element?: Entry): Promise<Entry[]> {
        if(element){
            const children=await this.readDirectory(element.uri);
            return children.map(([name,type])=>({
                uri: vs.Uri.file(path.join(element.uri.fsPath,name)),
                type
            }));
        }
        //@ts-ignore
        if(vs.workspace.workspaceFolders){
            const workspaceFolder=vs.workspace.workspaceFolders.filter(folder => folder.uri.scheme==='file')[0];
            if(workspaceFolder){
                const children=await this.readDirectory(workspaceFolder.uri);
                children.sort((a,b)=>{
                    if (a[1]===b[1]){
                        return a[0].localeCompare(b[0]);
                    }
                    return a[1]===vs.FileType.Directory ? -1:1;
                });
                return children.map(([name,type])=>({
                    uri:vs.Uri.file(path.join(workspaceFolder.uri.fsPath,name)),
                    type
                }));
            }
        }
        return [];
    }

    getTreeItem(element: Entry): ExtItem {
        const treeItem=new ExtItem(
            element.uri,
            element.type===vs.FileType.Directory?
                vs.TreeItemCollapsibleState.Collapsed:
                vs.TreeItemCollapsibleState.None
        );
        if(element.type===vs.FileType.File){
            treeItem.command={command: 'fileExplorer.openFile',title:"Open File", arguments:[element.uri],};
            treeItem.contextValue='file';
        }
        return treeItem;
    }
}

class ExtItem extends vs.TreeItem{
    constructor(
        public readonly resourceUri: vs.Uri,
        public readonly collapsibleState: vs.TreeItemCollapsibleState,
        
    ){
        super(resourceUri,collapsibleState);
    }
    get tooltip():string{
        //TODO:
        return "temp";
    }
    
}

export class FileStat implements vs.FileStat {

	constructor(private fsStat: fs.Stats) { }

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