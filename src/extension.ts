'use strict';
import * as vs from 'vscode';
import * as path from "path";
import * as fs from 'fs';
import * as mkdirp from 'mkdirp';
import { ExplorerExtProvider,Entry } from "./explorerExt";

export function activate(context: vs.ExtensionContext) {
    console.log('Congratulations, your extension "exploreext" is now active!');
    
    const rootPath = vs.workspace.rootPath;
    //@ts-ignore
    const provider=new ExplorerExtProvider(context,rootPath); 
    
    vs.window.registerTreeDataProvider("explorer-ext",provider);
    vs.commands.registerCommand("explorerExt.openFile",(file)=>{console.log(file);openFile(file);});
    vs.commands.registerCommand("explorerExt.newFile",async (file:Entry)=>{
        console.log(file);
        
        const inp=await vs.window.showInputBox({placeHolder:"new File",prompt:"name of file:"});
        console.log(inp);
        if(!inp){
            console.log("not Set");
            return;
        }
        const nPath=path.join(file.uri.fsPath,inp);
        console.log(nPath);
        await fs.exists(nPath,(exists)=>{
            if(exists){
                console.log("exists");
                vs.window.showWarningMessage("filename allready taken");
            }else{
                console.log("writing File");
                provider.writeFile(vs.Uri.parse(nPath),"",{create:true,overwrite:false});
            }
        });
        
    });
    vs.commands.registerCommand("explorerExt.newFolder",async (file)=>{
        console.log(file);
        
        const inp=await vs.window.showInputBox({placeHolder:"new File",prompt:"name of file:"});
        console.log(inp);
        if(!inp){
            console.log("not Set");
            return;
        }
        const nPath=path.join(file.uri.fsPath,inp);
        console.log(nPath);
        await fs.exists(nPath,(exists)=>{
            if(exists){
                console.log("exists");
                vs.window.showWarningMessage("filename allready taken");
            }else{
                console.log("writing File");
                mkdirp(nPath,(err)=>{});
            }
        });
    });

    vs.commands.registerCommand("explorerExt.reload",()=>provider.reload());
    vs.commands.registerCommand("explorerExt.reloadConfig",()=>provider.loadHideRules());

    vs.commands.registerCommand("explorerExt.deleteFile", (file:Entry) =>{
        provider.delete(file.uri,{recursive:file.type===vs.FileType.Directory});
    });
    vs.commands.registerCommand("explorerExt.rename",async (file:Entry)=>{
        const sPath=file.uri.fsPath.split(path.sep);
        const nName=await vs.window.showInputBox({
            placeHolder:sPath[sPath.length-1],
            value:sPath[sPath.length-1],
            valueSelection:[0,sPath[sPath.length-1].lastIndexOf(".")],
        prompt:"rename to"});
        if(nName){
            sPath.pop();
            const nPath=path.join(...sPath,nName);
            provider.rename(file.uri,vs.Uri.parse(nPath));
        }

    });

    //TODO: copy paste
    vs.commands.registerCommand("explorerExt.cut",(file:Entry)=>{
        vs.window.showErrorMessage("cut, copy & paste not jet implemented");
    });
    vs.commands.registerCommand("explorerExt.copy",(file:Entry)=>{
        vs.window.showErrorMessage("cut, copy & paste not jet implemented");
    });
    vs.commands.registerCommand("explorerExt.paste",(file:Entry)=>{
        vs.window.showErrorMessage("cut, copy & paste not jet implemented");
    });
}

export function deactivate() {
}

function openFile(file:vs.Uri){
    vs.window.showTextDocument(file);
}