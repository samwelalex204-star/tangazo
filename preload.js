'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const call = (channel) => (payload) => ipcRenderer.invoke(channel, payload || {});

contextBridge.exposeInMainWorld('tangazo', {
  bootstrap: call('app:bootstrap'),

  brand: {
    list: call('brand:list'),
    get: call('brand:get'),
    create: call('brand:create'),
    save: call('brand:save'),
    remove: call('brand:delete'),
    setActive: call('brand:setActive'),
    blank: call('brand:blank'),
    brief: call('brand:brief')
  },

  settings: {
    get: call('settings:get'),
    save: call('settings:save'),
    testKey: call('settings:testKey'),
    testWebhook: call('settings:testWebhook')
  },

  agent: {
    list: call('agent:list'),
    run: call('agent:run'),
    cancel: call('agent:cancel')
  },

  campaign: {
    run: call('campaign:run'),
    list: call('campaign:list'),
    get: call('campaign:get'),
    remove: call('campaign:delete'),
    updateSlot: call('campaign:updateSlot')
  },

  queue: {
    list: call('queue:list'),
    enqueue: call('queue:enqueue'),
    publishNow: call('queue:publishNow'),
    update: call('queue:update'),
    remove: call('queue:remove'),
    clear: call('queue:clear'),
    tick: call('queue:tick')
  },

  content: {
    list: call('content:list'),
    get: call('content:get'),
    remove: call('content:delete')
  },

  exports: {
    formats: call('export:formats'),
    campaign: call('export:campaign'),
    text: call('export:text')
  },

  data: {
    backup: call('data:export'),
    restore: call('data:import')
  },

  shell: {
    openPath: call('shell:openPath'),
    openExternal: call('shell:openExternal'),
    showItem: call('shell:showItem')
  },

  on: {
    campaignProgress: (fn) => {
      const h = (_e, p) => fn(p);
      ipcRenderer.on('campaign:progress', h);
      return () => ipcRenderer.removeListener('campaign:progress', h);
    },
    publisherLog: (fn) => {
      const h = (_e, p) => fn(p);
      ipcRenderer.on('publisher:log', h);
      return () => ipcRenderer.removeListener('publisher:log', h);
    }
  }
});
