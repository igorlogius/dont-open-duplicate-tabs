/* global browser */

const manifest = browser.runtime.getManifest();
const extname = manifest.name;

const delayTime = 2000;
let isActiv = true;

let setFocus = false;
let rmNotify = false;
let closeOld = false;
let allWindows = false;
let regexList = null;

let allowedDups = new Set();

let ready = false;

let tabsToCheck = [];

async function tabsLoading() {
  let query = {
    pinned: false,
    status: "loading",
  };

  if (!allWindows) {
    currentWindow: true;
  }
  const ret = await browser.tabs.query(query);
  return ret.length; // at least one tab is still loading
}

async function buildRegExList() {
  const out = [];
  (await getFromStorage("string", "matchers", ""))
    .split("\n")
    .forEach((line) => {
      line = line.trim();
      if (line !== "") {
        try {
          out.push(new RegExp(line));
        } catch (e) {
          // todo: show a notification that a regex failed to compile ...
          console.warn(e);
        }
      }
    });
  return out;
}

function isOnRegexList(url) {
  for (let i = 0; i < regexList.length; i++) {
    if (regexList[i].test(url)) {
      return true;
    }
  }
  return false;
}

async function notify(title, message = "", iconUrl = "icon.png") {
  const nid = await browser.notifications.create(crypto.randomUUID(), {
    type: "basic",
    iconUrl,
    title,
    message,
  });
  setTimeout(() => {
    browser.notifications.clear(nid);
  }, 5000);
}

async function getFromStorage(type, id, fallback) {
  let tmp = await browser.storage.local.get(id);
  return typeof tmp[id] === type ? tmp[id] : fallback;
}

async function forceDuplicate(tab) {
  // check if multiple tabs in this window are highlighted
  const tabIds = (
    await browser.tabs.query({
      highlighted: true,
      currentWindow: true,
      pinned: false,
    })
  ).map((t) => t.id);
  if (tabIds.includes(tab.id)) {
    for (const tId of tabIds) {
      let dup = await browser.tabs.duplicate(tId, { index: tab.index + 1 });
      allowedDups.add(dup.id);
    }
    setTimeout(() => {
      for (const tId of tabIds) {
        if (allowedDups.has(tId)) {
          allowedDups.delete(tId);
        }
      }
    }, 1000 * 30); // grace period
  } else {
    let dup = await browser.tabs.duplicate(tab.id, { index: tab.index + 1 });
    allowedDups.add(dup.id);
    setTimeout(() => {
      if (allowedDups.has(dup.id)) {
        allowedDups.delete(dup.id);
      }
    }, 1000 * 30); // grace period
  }
}

async function onBAClicked(tab, clickdata, c) {
  isActiv = !isActiv;
  if (isActiv) {
    browser.browserAction.setBadgeText({ text: "on" });
    browser.browserAction.setBadgeBackgroundColor({ color: "green" });
  } else {
    browser.browserAction.setBadgeText({ text: "off" });
    browser.browserAction.setBadgeBackgroundColor({ color: "red" });
  }
}

async function onStorageChanged() {
  closeOld = await getFromStorage("boolean", "closeOld", false);
  setFocus = await getFromStorage("boolean", "setFocus", false);
  rmNotify = await getFromStorage("boolean", "rmNotify", false);
  allWindows = await getFromStorage("boolean", "allWindows", true);
  regexList = await buildRegExList();
}

async function getDups(check_tab) {
  const dups = [];

  let query = {
    hidden: false,
    pinned: false,
  };

  if (!allWindows) {
    query["windowId"] = check_tab.windowId;
  }

  const consideredTabs = (await browser.tabs.query(query)).sort(
    (a, b) => b.lastAccessed - a.lastAccessed,
  );

  // this can be put into a filter expression after with the sort statement
  for (const tab of consideredTabs) {
    if (
      tab.id !== check_tab.id &&
      tab.url === check_tab.url &&
      tab.cookieStoreId === check_tab.cookieStoreId &&
      !tab.pinned
    ) {
      dups.push(tab.id);
    }
  }
  return dups;
}

async function periodic_doStuff() {
  while (tabsToCheck.length > 0 && (await tabsLoading()) < 1) {
    doStuff(tabsToCheck.pop());
  }
}

async function doStuff(tabId) {
  if (allowedDups.has(tabId)) {
    return;
  }

  try {
    const tab = await browser.tabs.get(tabId);

    if(tab.pinned){ // ignore pinned tabs
        return;
    }

    if (tab.status !== "complete") {
      tabsToCheck.push(tabId);
      return;
    }

    const dups = await getDups(tab);

    if (dups.length < 1) {
      // no duplicats => end
      return;
    }

    if (isOnRegexList(tab.url)) {
      // is whitelisted => end
      return;
    }

    if (closeOld) {
      if (setFocus) {
        browser.tabs.update(tab.id, { active: true });
      }
      await browser.tabs.remove(dups);
      if (rmNotify) {
        notify(extname, `removed ${dups.length} old duplicate\n${tab.url}`);
      }
    } else {
      //browser.tabs.remove(dups.slice(1));
      await browser.tabs.remove(tab.id);
      if (setFocus) {
        browser.tabs.update(dups[0], { active: true });
      }
      if (rmNotify) {
        notify(extname, `removed new duplicate\n${tab.url}`);
      }
    }
  } catch (e) {}
}

async function onTabUpdated(tabId, changeInfo) {
  if (!ready) {
    return;
  }
  if (!isActiv) {
    return;
  }
  if (typeof changeInfo.url === "string" && changeInfo.url !== "") {
    setTimeout(async () => {
      tabsToCheck.push(tabId);
    }, delayTime);
  }
}

async function onTabCreated(tab) {
  if (!ready) {
    return;
  }
  if (!isActiv) {
    return;
  }
  setTimeout(async () => {
    tabsToCheck.push(tab.id);
  }, delayTime);
}

function onTabRemoved(tabId) {
  if (allowedDups.has(tabId)) {
    allowedDups.delete(tabId);
  }
}

// setup
(async () => {
  browser.browserAction.setBadgeBackgroundColor({ color: "green" });
  browser.browserAction.setBadgeText({ text: "on" });
  await onStorageChanged();
  ready = true;
})();

// add listeners
browser.tabs.onCreated.addListener(onTabCreated);
browser.tabs.onUpdated.addListener(onTabUpdated, { properties: ["url"] });
browser.tabs.onRemoved.addListener(onTabRemoved);
browser.browserAction.onClicked.addListener(onBAClicked);
browser.storage.onChanged.addListener(onStorageChanged);

// show the user the options page on first installation
browser.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    browser.runtime.openOptionsPage();
  }

  // convert storage data
  if (details.reason === "update") {
    let selectors = await getFromStorage("object", "selectors", []);

    out = "";
    selectors.forEach((e) => {
      if (typeof e.url_regex === "string") {
        out = out + e.url_regex + "\n";
      }
    });

    if (out !== "") {
      setToStorage("matchers", out);
    }
  }
});

async function onCommand(cmd) {
  if (cmd === "Duplicate Tabs") {
    const tab = (
      await browser.tabs.query({
        active: true,
        currentWindow: true,
        pinned: false,
      })
    )[0];
    forceDuplicate(tab);
  }
}

browser.commands.onCommand.addListener(onCommand);

browser.menus.create({
  title: "Duplicate Tabs",
  contexts: ["tab"],
  onclick: async (info, tab) => {
    forceDuplicate(tab);
  },
});

setInterval(periodic_doStuff, 10000);
