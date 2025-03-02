import * as vscode from 'vscode';
import SpecRunnerConfig, { TerminalClear } from '../SpecRunnerConfig';
import { cmdJoin, quote, teeCommand } from '../util';
import SpecResultPresenter from '../SpecResultPresenter';
import { RunRspecOrMinitestArg } from '../types';

export class MinitestRunner {
  private _term!: vscode.Terminal;
  private config: SpecRunnerConfig;
  private outputFilePath: string;
  private presenter: SpecResultPresenter;

  constructor(config: SpecRunnerConfig, outputFilePath: string, presenter: SpecResultPresenter) {
    this.config = config;
    this.outputFilePath = outputFilePath;
    this.presenter = presenter;
  }

  async runTest(arg?: RunRspecOrMinitestArg) {
    if (this.config.saveBeforeRunning) {
      await vscode.commands.executeCommand('workbench.action.files.save');
    }

    if (arg?.fileName) {
      this.runTestForFile(arg.fileName, arg.line, arg.name, arg.fromCodeLens);
    } else {
      this.runCurrentTest();
    }
  }

  async runTestForFile(fileName: string, line?: number, testName?: string, fromCodeLens?: boolean) {
    try {
      const command = this.buildMinitestCommand(fileName, line, testName, fromCodeLens);
      this.runTerminalCommand(command);
      this.presenter.setPending(fileName);
    } catch (error: any) {
      if (error?.name === 'NoWorkspaceError') {
        console.error('SpecRunner: Unable to run test as no workspace is open.', error);
        vscode.window.showErrorMessage('SpecRunner: Unable to run test. It appears that no workspace is open.');
      } else {
        throw error;
      }
    }
  }

  async runCurrentTest() {
    const filePath = vscode.window.activeTextEditor?.document.fileName;
    if (!filePath) {
      console.error('SpecRunner: Unable to run test as no editor is open.');
      vscode.window.showErrorMessage('SpecRunner: Unable to run test. It appears that no editor is open.');
      return;
    }

    await this.runTestForFile(filePath);
  }

  private buildMinitestCommand(fileName: string, line?: number, testName?: string, fromCodeLens?: boolean) {
    const file = line ? [fileName, ':', line].join('') : fileName;

    const cdCommand = this.buildChangeDirectoryToWorkspaceRootCommand();
    const minitestCommand = [this.config.minitestCommand, quote(file)].join(' ');

    let lineNumber = line || 'ALL';
    if (fromCodeLens) {
      lineNumber = `${lineNumber} true`;
    }
    const saveRunOptions = cmdJoin(`echo ${fileName} > ${this.outputFilePath}`, `echo ${lineNumber} >> ${this.outputFilePath}`);
    const outputRedirect = `| ${teeCommand(this.outputFilePath, true, this.config.usingBashInWindows)}`;
    if (this.config.minitestDecorateEditorWithResults) {
      return cmdJoin(cdCommand, saveRunOptions, [minitestCommand, outputRedirect].join(' '));
    }

    return cmdJoin(cdCommand, minitestCommand);
  }

  private buildChangeDirectoryToWorkspaceRootCommand() {
    return this.config.changeDirectoryToWorkspaceRoot ? `cd ${quote(this.config.projectPath)}` : '';
  }

  private async runTerminalCommand(command: string) {
    this.terminal.show();

    if (this.config.clearTerminalOnTestRun === TerminalClear.Clear) {
      await vscode.commands.executeCommand('workbench.action.terminal.clear');
    }

    this.terminal.sendText(command);
  }

  private get terminal() {
    if (!this._term || this._term.exitStatus) {
      this._term = vscode.window.createTerminal('MinitestRunner');
    }

    return this._term;
  }
};

export default MinitestRunner;
