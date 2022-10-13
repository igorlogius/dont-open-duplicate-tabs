/* global browser */

const temporary = browser.runtime.id.endsWith('@temporary-addon');
const manifest = browser.runtime.getManifest();
const extname = manifest.name;

let isActiv = true;

function log() {
	if(arguments.length < 2){
		throw 'invalid number of arguments';
	}
	const level = arguments[0].trim().toLowerCase();
	let msg = '';
	for (let i=1; i < arguments.length; i++) {
		msg = msg + arguments[i];
	}
	if (['error','warn'].includes(level) || ( temporary && ['debug','info','log'].includes(level))) {
		console[level]('[' + extname + '] [' + level.toUpperCase() + '] ' + msg);
	}
}

async function getFromStorage(type,id, fallback) {
	let tmp = await browser.storage.local.get(id);
	return (typeof tmp[id] === type) ? tmp[id] : fallback;
}

//async function onUpdated(tabId, changeInfo, tabInfo) {
async function onCreatedNaviTarget(details) {


	if(!isActiv) {
		return;
	}
	if(typeof details.url !== 'string' ) {
		return;
	}

	const selectors = await ((async () => {
		try {
			const tmp = await browser.storage.local.get('selectors');
			if(typeof tmp['selectors'] !== 'undefined') {
				return tmp['selectors'];
			}
		}catch(e){
			log('error',e.toString());
		}
		return [];
	})());

	const targetUrl = details.url;
	const targetTabId = details.tabId;

	const notify = await getFromStorage('boolean','notify', true);
	let message = '';


	for(const selector of selectors) {

		try {
			if(typeof selector.activ === 'boolean'
				&& selector.activ === true
				&& typeof selector.url_regex === 'string'
				&& selector.url_regex !== ''
				&& (new RegExp(selector.url_regex)).test(targetUrl)
			){

				message = `whitelist, RegEx:\n${selector.url_regex}\n matched with target url:\n${targetUrl}`
				//log('debug', message);

				if(notify) {

					browser.notifications.create(extname + targetTabId, {
						"type": "basic",
						"iconUrl": browser.runtime.getURL("icon.png"),
						"title": extname,
						"message":  message
					});
				}
				return;
			}
		}catch(e){
			log('error',e.toString());
		}
	}

	const tabs = await browser.tabs.query({});
	const focus = await getFromStorage('boolean','focus', false);

	for(const tab of tabs) {

		if(tab.id !== targetTabId
			&& tab.url === targetUrl
		) {
			message = `tab with url:\n${targetUrl}\nexists and focus is set to ${focus}`;
			//log('debug', message);

			if(focus) {
				browser.windows.update(tab.windowId, {focused: true});
				browser.tabs.update(tab.id, {active:true});
			}

			// close duplicate tab
			browser.tabs.remove(targetTabId);

			if(notify) {
				browser.notifications.create(extname + targetTabId, {
					"type": "basic",
					"iconUrl": browser.runtime.getURL("icon.png"),
					"title": extname,
					"message": message
				});
			}
			return;
		}
	}
	//log('debug', 'no duplicate found for' + targetUrl);
}


browser.browserAction.setBadgeBackgroundColor({color: "green"})
browser.browserAction.setBadgeText({"text": "on"});


//browser.tabs.onUpdated.addListener(onUpdated, { properties: ["status"] });

browser.webNavigation.onCreatedNavigationTarget.addListener(onCreatedNaviTarget);

browser.browserAction.onClicked.addListener((/*tab*/) => {

	isActiv = (!isActiv);
	//log('debug', `isActiv set to ${isActiv}`);
	if(isActiv){
		browser.browserAction.setBadgeText({"text": "on"});
		browser.browserAction.setBadgeBackgroundColor({color: "green"});
	}else{
		browser.browserAction.setBadgeText({"text": "off"});
		browser.browserAction.setBadgeBackgroundColor({color: "red"});
	}
});
