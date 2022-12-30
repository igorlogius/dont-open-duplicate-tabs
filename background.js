/* global browser */

const manifest = browser.runtime.getManifest();
const extname = manifest.name;
const newtaburl = 'about:newtab';
const hometaburl = 'about:home';

let isActiv = true;

let setFocus = false;
let doNotify = true;

let ignoreContainer = false;
let ignoreDiscarded = false;
let closeOldTab = false;
let ignoreAbout = false;

let onlyWithOpener = true;
let ignorePinned = true;
let wlistNotify = true;

let allowedDups = new Set();

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

//async function onBeforeNavigate(details) {
async function onTabUpdated(tabId, changeInfo, tabInfo) {

    if(typeof changeInfo.url !== 'string'){
        return;
    }

    if(!isActiv) {
        return;
    }

    if(allowedDups.has(tabId)){
        return;
    }

    //const tabInfo = await browser.tabs.get(details.tabId);

    if(await isWhitelisted(tabInfo.url)){
        if(wlistNotify){
            notify(extname, `created tab ${tabInfo.url} matches whitelist`);
        }
        return;
    }

    if(onlyWithOpener && isNaN(tabInfo.openerTabId) ){
       return;
    }

    const dups = await getDups(tabInfo);

    if(dups.length < 1){
        return;
    }

    if(closeOldTab){
        if(setFocus) {
            browser.tabs.update(tabInfo.id, {active:true});
        }
        browser.tabs.remove(dups);
        notify(extname, `removed ${dups.length} old duplicate\n${tabInfo.url}`);
    }else{
        //browser.tabs.remove(dups.slice(1));
        browser.tabs.remove(tabInfo.id);
        if(setFocus) {
            browser.tabs.update(dups[0], {active:true});
        }
        notify(extname, `removed new duplicate\n${tabInfo.url}`);
    }
}

function onBAClicked() {
    isActiv = (!isActiv);
    if(isActiv){
        browser.browserAction.setBadgeText({"text": "on"});
        browser.browserAction.setBadgeBackgroundColor({color: "green"});
    }else{
        browser.browserAction.setBadgeText({"text": "off"});
        browser.browserAction.setBadgeBackgroundColor({color: "red"});
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
    wlistNotify = await getFromStorage('boolean','wlistNotify', true);
}

async function isWhitelisted(url){

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
                && (new RegExp(selector.url_regex)).test(url)
            ){
                return true;
            }
        }catch(e){
            console.error(e);
        }
    }
    return false;
}

async function getDups(check_tab){

    const dups = [];

    let query = {
        windowId: check_tab.windowId,
        hidden: false
    };
    if(ignoreDiscarded){
        query['discarded'] = false;
    }
    if(ignorePinned) {
        query['pinned'] = false;
    }

    const consideredTabs = (await browser.tabs.query(query)).sort( (a,b) => (b.lastAccessed - a.lastAccessed));

    for(const tab of consideredTabs) {
        if(    tab.id  !== check_tab.id
            && tab.url === check_tab.url
            && ( (tab.cookieStoreId === check_tab.cookieStoreId) || ignoreContainer )
        ){
            dups.push(tab.id);
        }
    }
    return dups;
}

browser.menus.create({
    title: 'Force Duplicate Tabs',
    contexts: ["tab"],
    onclick: async (info, tab) => {
        // check if multiple tabs in this window are highlighted
        const tabIds = (await browser.tabs.query({highlighted: true, currentWindow: true})).map( t => t.id);
        if(tabIds.includes(tab.id)){
            for(const tId of tabIds){
                let dup = await browser.tabs.duplicate(tId,{index: tab.index+1});
                allowedDups.add(dup.id);
            }
            setTimeout( () => {
                for(const tId of tabIds){
                    if(allowedDups.has(tId)){
                        allowedDups.delete(tId);
                    }
                }
            },1000*60); // 30 seconds grace period
        }else{
                let dup = await browser.tabs.duplicate(tab.id, {index: tab.index+1});
                allowedDups.add(dup.id);
            setTimeout( () => {
                    if(allowedDups.has(dup.id)){
                        allowedDups.delete(dup.id);
                    }
            },1000*60); // 30 seconds grace period

        }
    }
});

function onTabRemoved (tabId) {
    if(allowedDups.has(tabId)){
        allowedDups.delete(tabId);
    }
}

async function onTabCreated(tab) {
    if(!ignoreAbout){
        if(tab.status === 'complete' && (newtaburl === tab.url  || hometaburl === tab.url)){

            const dups = await getDups(tab);

            if(dups.length < 1){
                return;
            }

            if(closeOldTab){
                if(setFocus) {
                    browser.tabs.update(tab.id, {active:true});
                }
                browser.tabs.remove(dups);
                notify(extname, `removed ${dups.length} old duplicates\n${tab.url}`);
            }else{
                //browser.tabs.remove(dups.slice(1));
                browser.tabs.remove(tab.id);
                if(setFocus) {
                    browser.tabs.update(dups[0], {active:true});
                }
                notify(extname, `removed new duplicate\n${tab.url}`);
            }
        }
    }
}

// setup
(async ()=>{
    browser.browserAction.setBadgeBackgroundColor({color: "green"})
    browser.browserAction.setBadgeText({"text": "on"});
    await onStorageChanged();
})();

// register listeners
browser.tabs.onCreated.addListener(onTabCreated);
browser.tabs.onUpdated.addListener(onTabUpdated, {properties: ['url']});
browser.browserAction.onClicked.addListener(onBAClicked);
browser.storage.onChanged.addListener(onStorageChanged);
browser.tabs.onRemoved.addListener(onTabRemoved);

