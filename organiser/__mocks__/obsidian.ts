export class Plugin {
  app: any;
  constructor(app: any) {
    this.app = app;
  }
  async onload() {}
  async onunload() {}
  registerView() {}
  addRibbonIcon() {}
}

export class ItemView {
  leaf: any;
  constructor(leaf: any) {
    this.leaf = leaf;
  }
  async onOpen() {}
  async onClose() {}
}

export class WorkspaceLeaf {
  view: any;
}
