"use strict";
import * as iothub from "azure-iothub";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { Constants } from "./constants";
import { TelemetryClient } from "./telemetryClient";

export class Utility {
    public static getConfiguration(): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration("azure-iot-edge");
    }

    public static getDeviceIdFromConnectionString(deviceConnectionString: string): string {
        const result = /DeviceId=([^=;]+);/.exec(deviceConnectionString);
        return result ? result[1] : "";
    }

    public static getHostNameFromConnectionString(iotHubConnectionString: string): string {
        const result = /^HostName=([^=]+);/.exec(iotHubConnectionString);
        return result ? result[1] : "";
    }

    public static showfile(fileName: string) {
        vscode.workspace.openTextDocument(fileName).then((document: vscode.TextDocument) => {
            vscode.window.showTextDocument(document);
        });
    }

    public static getDevices(): Promise<iothub.Device[]> {
        const config = Utility.getConfiguration();
        const iotHubConnectionString = config.get<string>(Constants.IotHubConnectionStringKey);
        if (!iotHubConnectionString) {
            vscode.window.showWarningMessage("Please login first.");
            return;
        }
        const registry = iothub.Registry.fromConnectionString(iotHubConnectionString);

        return new Promise<iothub.Device[]>((resolve, reject) => {
            registry.list((err, deviceList) => {
                if (err) {
                    reject(`[Failed to get IoT Hub devices] ${err.message}`);
                } else {
                    resolve(deviceList);
                }
            });
        });
    }

    public static checkWorkspace(): boolean {
        if (!vscode.workspace.workspaceFolders) {
            vscode.window.showErrorMessage("This extension only works when folders are opened.");
            return false;
        }

        return true;
    }

    public static adjustFilePath(filePath: string): string {
        if (os.platform() === "win32") {
            const windowsShell = vscode.workspace.getConfiguration("terminal").get<string>("integrated.shell.windows");
            const terminalRoot = Utility.getConfiguration().get<string>("terminalRoot");
            if (windowsShell && terminalRoot) {
                filePath = filePath
                    .replace(/^([A-Za-z]):/, (match, p1) => `${terminalRoot}${p1.toLowerCase()}`)
                    .replace(/\\/g, "/");
            } else if (windowsShell && windowsShell.toLowerCase().indexOf("bash") > -1 && windowsShell.toLowerCase().indexOf("git") > -1) {
                // Git Bash
                filePath = filePath
                    .replace(/^([A-Za-z]):/, (match, p1) => `/${p1.toLowerCase()}`)
                    .replace(/\\/g, "/");
            } else if (windowsShell && windowsShell.toLowerCase().indexOf("bash") > -1 && windowsShell.toLowerCase().indexOf("windows") > -1) {
                // Bash on Ubuntu on Windows
                filePath = filePath
                    .replace(/^([A-Za-z]):/, (match, p1) => `/mnt/${p1.toLowerCase()}`)
                    .replace(/\\/g, "/");
            }
        }
        return filePath;
    }

    public static registerDebugTelemetryListener() {
        vscode.debug.onDidStartDebugSession((session) => {
            if (Constants.EdgeDebugSessions.indexOf(session.name) > -1) {
                TelemetryClient.sendEvent("startDebugSession", { sessionName: session.name });
            }
        });
    }

    public static async getInputFilePath(inputFileFromContextMenu: vscode.Uri, filePattern: string, fileDescription: string, eventName: string): Promise<string> {
        if (!Utility.checkWorkspace()) {
            return null;
        }

        if (inputFileFromContextMenu) {
            TelemetryClient.sendEvent(eventName, { entry: "contextMenu" });
            return inputFileFromContextMenu.fsPath;
        } else {
            TelemetryClient.sendEvent(eventName, { entry: "commandPalette" });

            try {
                const fileItemList: Promise<vscode.QuickPickItem[]> = Utility.findFiles(filePattern, fileDescription);
                const fileItem: vscode.QuickPickItem = await vscode.window.showQuickPick(fileItemList, { placeHolder: `Select ${fileDescription}` });
                if (fileItem) {
                    return fileItem.detail;
                } else {
                    return null;
                }
            } catch (error) {
                vscode.window.showErrorMessage((error as Error).message);
            }
        }
    }

    public static async findFiles(filePattern: string, fileDescription: string): Promise<vscode.QuickPickItem[]> {
        const fileList: vscode.Uri[] = await vscode.workspace.findFiles(filePattern);
        if (!fileList || fileList.length === 0) {
            return Promise.reject<vscode.QuickPickItem[]>(`No ${fileDescription} can be found under this workspace.`);
            // throw new Error(`No ${fileDescription} can be found under this workspace.`);
            // return null;
        }

        return Utility.getQuickPickItemsFromUris(fileList);
    }

    public static getQuickPickItemsFromUris(uriList: vscode.Uri[]): vscode.QuickPickItem[] {
        return uriList.map((u) => Utility.getQuickPickItem(u));
    }

    public static getQuickPickItem(uri: vscode.Uri): vscode.QuickPickItem {
        const quickPickItem: vscode.QuickPickItem = {
            label: path.join(".", uri.fsPath.substr(vscode.workspace.getWorkspaceFolder(uri).uri.fsPath.length)),
            description: null,
            detail: uri.fsPath,  // use the `detail` property to save URI's full path, which will be used later
        };

        return quickPickItem;
    }

    public static getRelativePath(folder: vscode.Uri, rootFolder: vscode.Uri): string {
        if (folder.fsPath.startsWith(rootFolder.fsPath)) {
            const relativePath: string = "." + folder.fsPath.substr(rootFolder.fsPath.length);

            return relativePath.replace(/\\/g, "/");
        }

        return null;
    }
}
