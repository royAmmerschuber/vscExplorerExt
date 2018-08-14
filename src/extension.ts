'use strict';
import * as vs from 'vscode';
import { ExplorerExt } from "./explorerExt";

export function activate(context: vs.ExtensionContext) {
    console.log('Congratulations, your extension "exploreext" is now active!');

    new ExplorerExt(context);

    let disposable = vs.commands.registerCommand('extension.sayHello', () => {
        vs.window.showInformationMessage('Hello World!');
    });

    context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {
}
