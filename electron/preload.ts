import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,

  getVersion: () => ipcRenderer.invoke('get-version'),

  onDeepLink: (callback: (url: string) => void) => {
    ipcRenderer.on('deep-link', (_event, url) => callback(url));
  },

  openClawPanel: () => ipcRenderer.invoke('openclaw:open-panel'),
  closeClawPanel: () => ipcRenderer.invoke('openclaw:close-panel'),
});
