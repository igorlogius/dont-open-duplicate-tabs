/* global browser */

const manifest = browser.runtime.getManifest();
const extname = manifest.name;

const delayTime = 2000;
let isActiv = true;

let setFocus = false;
let rmNotify = true;
let closeOld = false;
let selectors = [];
let allWindows = false;

let allowedDups = new Set();

let ready = false;

async function notify(title, message = "", iconUrl = "icon.png") {
  const nid = await browser.notifications.create("" + Date.now(), {
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

function onBAClicked() {
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
  rmNotify = await getFromStorage("boolean", "rmNotify", true);
  allWindows = await getFromStorage("boolean", "allWindows", true);
  selectors = await getFromStorage("object", "selectors", []);
}

async function isWhitelisted(url) {
  for (const selector of selectors) {
    try {
      if (
        typeof selector.activ === "boolean" &&
        selector.activ === true &&
        typeof selector.url_regex === "string" &&
        selector.url_regex !== "" &&
        new RegExp(selector.url_regex).test(url)
      ) {
        return true;
      }
    } catch (e) {
      console.error(e);
    }
  }
  return false;
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
    (a, b) => b.lastAccessed - a.lastAccessed
  );

  // this can be put into a filter expression after with the sort statement
  for (const tab of consideredTabs) {
    if (
      tab.id !== check_tab.id &&
      tab.url === check_tab.url &&
      tab.cookieStoreId === check_tab.cookieStoreId
    ) {
      dups.push(tab.id);
    }
  }
  return dups;
}

async function doStuff(tabId) {
  if (allowedDups.has(tabId)) {
    return;
  }

  const tab = await browser.tabs.get(tabId);

  const dups = await getDups(tab);

  if (dups.length < 1) {
    // no duplicats => end
    return;
  }

  if (await isWhitelisted(tab.url)) {
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
      doStuff(tabId);
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
    doStuff(tab.id);
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
