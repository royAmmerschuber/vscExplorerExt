import * as vs from "vscode";

export class ExplorerExtProvider implements vs.TreeDataProvider<ExtItem>{
    private _onDidChangeTreeData: vs.EventEmitter<ExtItem | undefined> = new vs.EventEmitter<ExtItem | undefined>();
    readonly onDidChangeTreeData:vs.Event<ExtItem|undefined>=this._onDidChangeTreeData.event;

    constructor(
        private context:vs.ExtensionContext,
        private workspaceRoot:string
    ){}

    getTreeItem(element: ExtItem): vs.TreeItem {
        return element;
    }

    getChildren(element?: ExtItem): Thenable<ExtItem[]> {
        if (!this.workspaceRoot) {
			vs.window.showInformationMessage('No dependency in empty workspace');
			return Promise.resolve([]);
        }
        return new Promise(resolve =>{
            if(element){
                resolve();
            }else{
                
            }
        });
    }
    
}

class ExtItem extends vs.TreeItem{
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vs.TreeItemCollapsibleState,
        public readonly command?: vs.Command
    ){
        super(label,collapsibleState);
    }
    get tooltip():string{
        //TODO:
        return "temp";
    }
}
