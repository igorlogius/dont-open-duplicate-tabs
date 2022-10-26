/* global browser */

const manifest = browser.runtime.getManifest();
const extname = manifest.name;
const resetTime = 1*60*1000;
const newtaburl = 'about:newtab';
const hometaburl = 'about:home';

let resetTID;
let isActiv = true;

let setFocus = false;
let doNotify = true;
let onlyWithOpener = true;
let ignoreContainer = false;
let ignoreDiscarded = false;
let closeOldTab = false;
let ignoreAbout = false;
let ignorePinned = true;

function notify(title, message = "", iconUrl = "icon.png") {
    if(doNotify) {
        return browser.notifications.create(""+Date.now(),
            {
               "type": "basic"
                ,iconUrl
                ,title
                ,message
            }
        );
    }
}

async function getFromStorage(type,id, fallback) {
    let tmp = await browser.storage.local.get(id);
    return (typeof tmp[id] === type) ? tmp[id] : fallback;
}

async function onBeforeNavigate(details) {

    if(!isActiv) {
        return;
    }

    if(! /^https?:\/\//.test(details.url) ) {
        return;
    }
    const tabInfo = await browser.tabs.get(details.tabId);

    const targetUrl = details.url;
    const targetTabId = details.tabId;
    const targetWinId = tabInfo.windowId;
    const targetActiv = tabInfo.active;

    if(onlyWithOpener && isNaN(tabInfo.openerTabId) ){
       return;
    }
    const selectors = await ((async () => {
        try {
            const tmp = await browser.storage.local.get('selectors');
            if(typeof tmp['selectors'] !== 'undefined') {
                return tmp['selectors'];
            }
        }catch(e){
            console.error(e);
        }
        return [];
    })());


    for(const selector of selectors) {

        try {
            if(    typeof selector.activ === 'boolean'
                && selector.activ === true
                && typeof selector.url_regex === 'string'
                && selector.url_regex !== ''
                && (new RegExp(selector.url_regex)).test(targetUrl)
            ){
                notify(extname, `whitelist, RegEx:\n${selector.url_regex}\n matched with target url:\n${targetUrl}`);
                return;
            }
        }catch(e){
            console.error(e);
        }
    }

    let query = {};
    query['hidden'] = false;
    if(ignoreDiscarded){
        query['discarded'] = false;
    }
    if(ignorePinned) {
        query['pinned'] = false;
    }
    //console.debug(query);
    const tabs = await browser.tabs.query(query);

    for(const tab of tabs) {
        if(   tab.id  !== targetTabId
            && tab.url === targetUrl
            && ( (tab.cookieStoreId === tabInfo.cookieStoreId) || ignoreContainer )
        )
        {
            // close duplicate tab
            notify(extname, `tab with url:\n${targetUrl}\nexists and focus is set to ${setFocus}`);
            if(closeOldTab){
                if(setFocus) {
                    browser.windows.update(targetWinId, {focused: true});
                    browser.tabs.update(targetTabId, {active:true});
                }
                browser.tabs.remove(tab.id);
            }else{
                if(setFocus || targetActiv) {
                    browser.windows.update(tab.windowId, {focused: true});
                    browser.tabs.update(tab.id, {active:true});
                }
                browser.tabs.remove(targetTabId);
            }
            return; // done  , if multiple exists ... well that means some where created while off ... lets be nice and not kill everything at once
        }
    }
}

function onBAClicked() {
    isActiv = (!isActiv);
    clearTimeout(resetTID);
    if(isActiv){
        browser.browserAction.setBadgeText({"text": "on"});
        browser.browserAction.setBadgeBackgroundColor({color: "green"});
    }else{
        browser.browserAction.setBadgeText({"text": "off"});
        browser.browserAction.setBadgeBackgroundColor({color: "red"});

        resetTID = setTimeout( () => {
            if(!isActiv){
                isActiv = true;
                browser.browserAction.setBadgeText({"text": "on"});
                browser.browserAction.setBadgeBackgroundColor({color: "green"});
            }
        }, resetTime); // reset after
    }
}

async function onStorageChanged() {
    setFocus = await getFromStorage('boolean','focus', false);
    doNotify = await getFromStorage('boolean','notify', true);
    onlyWithOpener = await getFromStorage('boolean','opener', true);
    ignoreContainer = await getFromStorage('boolean','container', false);
    ignoreDiscarded = await getFromStorage('boolean','discarded', false);
    closeOldTab = await getFromStorage('boolean','closeOldTab', false);
    ignoreAbout = await getFromStorage('boolean','ignoreAbout', false);
    ignorePinned = await getFromStorage('boolean','ignorePinned', true);
}

// remove duplicate about:newtab in a window
async function onTabActivated(info){

    if(!isActiv) {
        return;
    }

    if(ignoreAbout){
        return;
    }

    let query = {
        windowId: info.windowId,
        url: [ newtaburl, hometaburl ]
    };

    if(ignorePinned) {
        query['pinned'] = false;
    }

    const about_newtabIds = (await browser.tabs.query(query)).sort( (a,b) => (b.lastAccessed - a.lastAccessed)).map( t => t.id );

    if(about_newtabIds.length > 0){
        // lastAccessed tab  should be the activated one, so we dont need loops here *yay*
        about_newtabIds.splice(0,1);
        browser.tabs.remove(about_newtabIds);
    }
}

// setup
(async ()=>{
    browser.browserAction.setBadgeBackgroundColor({color: "green"})
    browser.browserAction.setBadgeText({"text": "on"});
    await onStorageChanged();
})();

// register listeners
browser.webNavigation.onCompleted.addListener(onBeforeNavigate);
browser.browserAction.onClicked.addListener(onBAClicked);
browser.storage.onChanged.addListener(onStorageChanged);
browser.tabs.onActivated.addListener(onTabActivated);
