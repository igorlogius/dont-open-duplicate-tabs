/* global browser */

function onChange(evt) {
  const id = evt.target.id;
  let el = document.getElementById(id);

  let value = el.type === "checkbox" ? el.checked : el.value;
  let obj = {};
  if (typeof value === "string") {
    value = value.trim(); // strip whitespace
  }
  obj[id] = value;

  browser.storage.local.set(obj);
}

["matchers", "setFocus", "rmNotify", "closeOld", "allWindows"].map((id) => {
  browser.storage.local
    .get(id)
    .then((obj) => {
      let el = document.getElementById(id);
      let val = obj[id];

      if (typeof val !== "undefined") {
        if (el.type === "checkbox") {
          el.checked = val;
        } else {
          el.value = val;
        }
      }
    })
    .catch(console.error);

  let el = document.getElementById(id);
  el.addEventListener("click", onChange);
  el.addEventListener("input", onChange);
});

// ----------

// Permission checkboxes

function handlePermissionChange() {
  Array.from(
    document.querySelectorAll('input[name="permission"][type="checkbox"]'),
  ).forEach(async (el) => {
    if (await browser.permissions.contains({ permissions: [el.value] })) {
      el.checked = true;
    } else {
      el.checked = false;
    }
  });
}

browser.permissions.onRemoved.addListener(handlePermissionChange);

browser.permissions.onAdded.addListener(handlePermissionChange);

Array.from(
  document.querySelectorAll('input[name="permission"][type="checkbox"]'),
).forEach(async (el) => {
  if (await browser.permissions.contains({ permissions: [el.value] })) {
    el.checked = true;
  } else {
    el.checked = false;
  }

  el.addEventListener("click", async (evt) => {
    if (evt.target.checked) {
      await browser.permissions.request({ permissions: [evt.target.value] });
    } else {
      await browser.permissions.remove({ permissions: [evt.target.value] });
    }

    handlePermissionChange();
  });
});
