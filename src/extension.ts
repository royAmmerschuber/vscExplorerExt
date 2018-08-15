'use strict';
import * as vs from 'vscode';
import { ExplorerExtProvider } from "./explorerExt";

export function activate(context: vs.ExtensionContext) {
    console.log('Congratulations, your extension "exploreext" is now active!');
    
    const rootPath = vs.workspace.rootPath;
    //@ts-ignore
    const provider=new ExplorerExtProvider(context,rootPath); 
    
    vs.window.registerTreeDataProvider("explorer-ext",provider);
    
}

// this method is called when your extension is deactivated
export function deactivate() {
}
