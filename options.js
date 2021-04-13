
function onChange(evt) {

	id = evt.target.id;
	el = document.getElementById(id);

	let value = ( (el.type === 'checkbox') ? el.checked : el.value)
	let obj = {}
	obj[id] = value;

	browser.storage.local.set(obj);

}

[ "focus", "notify" ].map( (id) => {

	browser.storage.local.get(id).then( (obj) => {

		el = document.getElementById(id);
		val = obj[id];

		if(typeof val !== 'undefined') {
			if(el.type === 'checkbox') {
				el.checked = val;
			} else {
				el.value = val;
			}
		}

	}).catch( (err) => {} );

	el = document.getElementById(id);
	el.addEventListener('click', onChange);
});
