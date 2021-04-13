
const temporary = browser.runtime.id.endsWith('@temporary-addon'); 
const manifest = browser.runtime.getManifest();
const extname = manifest.name;

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

async function getFromStorage(type,id) {
	let tmp = await browser.storage.local.get(id);
	return (typeof tmp[id] === type) ? tmp[id] : false;
}

async function onCreatedNaviTarget(details) {

	const targetUrl = details.url;
	const targetTabId = details.tabId;
	const tabs = await browser.tabs.query({});


	const focus = await getFromStorage('boolean','focus');
	const notify = await getFromStorage('boolean','notify');

	for(const tab of tabs) {
		if(tab.id !== targetTabId 
			&& tab.url === targetUrl) {
			const message = `tab with url ${targetUrl} exists\nSwitching is set to ${focus}`;
			log('debug', message);

			if(focus) {
				await browser.windows.update(tab.windowId, {focused: true});
				await browser.tabs.update(tab.id, {active:true});
			}
			await browser.tabs.remove(targetTabId);

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
}

browser.webNavigation.onCreatedNavigationTarget.addListener(onCreatedNaviTarget);

