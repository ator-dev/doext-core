type FilterDetails = {
	key: string
	name: string
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const styleCreate = (): HTMLStyleElement => {
	const style = document.createElement("style");
	style.textContent = `
#action-select-panel {
	background: hsl(0 0% 80%);
	user-select: none;
}
#action-select-panel * {
	font-family: calibri;
	font-size: 20px;
}
#action-select-panel .entry {
	padding: 4px;
}
#action-select-panel .entry.selected {
	background: hsl(0 0% 90%);
}
#action-select-panel .list.filter .entry:not(.filtered) {
	display: none;
}
	`;
	return style;
};

const getApiQueryKeys = (apiQueryAction: APIQuery, key = ""): Array<string> =>
	Object.entries(apiQueryAction.actions).flatMap(([ keyLast, query ]) =>
		(query.isInvocable ? [ `${key}${keyLast}` ] : []).concat(getApiQueryKeys(query, `${key}${keyLast}.`))
	)
;

const getApiQueryAction = (key: string, apiQueryAction: APIQuery): APIQuery | undefined =>
	key.includes(".")
		? getApiQueryAction(key.split(".").slice(1).join("."), apiQueryAction.actions[key.split(".")[0]])
		: apiQueryAction.actions[key]
;

const toSentenceCase = (name: string) =>
	name[0].toUpperCase() + name.slice(1)
;

const entryCreate = (key: string, text: string, apiQuery?: APIQuery) => {
	const apiQueryAction = apiQuery ? getApiQueryAction(key, apiQuery) : undefined;
	const panel = document.createElement("div");
	panel.classList.add("entry");
	const labelName = document.createElement("div");
	labelName.classList.add("label", "name");
	labelName.textContent = apiQueryAction
		? toSentenceCase(apiQueryAction.nameShort ?? apiQueryAction.name)
		: (text.length ? text : "error");
	panel.appendChild(labelName);
	const labelKey = document.createElement("div");
	labelKey.classList.add("label", "key");
	labelKey.textContent = key;
	panel.appendChild(labelKey);
	return panel;
};

const entrySelect = (entry: Element) => {
	listEntriesDeselect();
	entry.classList.add("selected");
	entry.scrollIntoView({
		block: "center",
	});
};

const entrySubmitContext: {
	args: Record<string, APIArgument>
	param: string
	key: string
} = {
	args: {},
	param: "",
	key: "",
};

const entrySubmit = (entry?: Element) => {
	if (entry) {
		entrySelect(entry);
	}
	entry = document.querySelector("#action-select-panel .entry.selected") ?? undefined;
	if (!entry) {
		return;
	}
	let key = (entry.querySelector(".label.key") as Element).textContent ?? "";
	if (entrySubmitContext.param.length) {
		key = entrySubmitContext.key;
		entrySubmitContext.args[entrySubmitContext.param] = entry["apiArgument"];
		entrySubmitContext.param = "";
		entrySubmitContext.key = "";
	} else {
		entrySubmitContext.args = {};
		entrySubmitContext.key = key;
	}
	chrome.runtime.sendMessage({
		type: "invocation",
		key,
		args: entrySubmitContext.args,
	});
	const listener = ({ type, argumentRequests: [ argumentRequest ] }: { type: string, argumentRequests: [ APIArgumentRequest ] }) => {
		if (type !== "response") {
			return;
		}
		chrome.runtime.onMessage.removeListener(listener);
		if (!argumentRequest) {
			close();
			return;
		}
		const list = document.querySelector("#action-select-panel .list") as Element;
		list.replaceChildren();
		if (argumentRequest.info.type === "number") {
			Array(32).fill(0).forEach((value, i) => {
				list.appendChild(entryCreate("", i.toString()))["apiArgument"] = i.toString();
			});
		}
		(argumentRequest.info.presets ?? []).forEach(preset => {
			list.appendChild(entryCreate("", preset.name.length ? preset.name : preset.id))["apiArgument"] = preset.id;
		});
		const input = document.querySelector("#action-select-panel .input") as HTMLInputElement;
		input.value = "";
		listFilterEnd();
		listSelectNth(0);
		entrySubmitContext.param = argumentRequest.param;
	};
	chrome.runtime.onMessage.addListener(listener);
};

const listFilterStart = () => {
	listFilterEnd();
	const list = document.querySelector("#action-select-panel .list") as Element;
	list.classList.add("filter");
};

const listFilterEnd = () => {
	const list = document.querySelector("#action-select-panel .list") as Element;
	list.classList.remove("filter");
	list.querySelectorAll(".entry.filtered").forEach(entry => {
		entry.classList.remove("filtered");
	});
};

const listFilter = (predicate: (details: FilterDetails) => boolean) => {
	listFilterStart();
	const list = document.querySelector("#action-select-panel .list") as Element;
	Array.from(list.querySelectorAll(".entry"))
		.filter(entry => predicate({
			key: (entry.querySelector(".label.key") as Element).textContent ?? "",
			name: ((entry.querySelector(".label.name") as Element).textContent ?? "").toLowerCase(),
		}))
		.forEach(entry => {
			entry.classList.add("filtered");
		});
	listSelectNth(0);
	if (listGetEntriesFiltered().length === 1) {
		entrySubmit();
	}
};

const listGetEntriesFiltered = () =>
	Array.from(document.querySelectorAll("#action-select-panel .list.filter .entry.filtered, .list:not(.filter) .entry"))
;

const listEntriesDeselect = () =>
	document.querySelectorAll("#action-select-panel .list .entry.selected").forEach(entry => {
		entry.classList.remove("selected");
	})
;

const listSelectNth = (index: number) => {
	listEntriesDeselect();
	const entries = listGetEntriesFiltered();
	if (!entries.length) {
		return;
	}
	const entry = entries[(entries.length + index) % entries.length];
	entrySelect(entry);
};

const listGetEntryIndex = (criteria: {
	entry?: Element
	selected?: boolean
}) => {
	const list = document.querySelector("#action-select-panel .list") as Element;
	const entry = criteria.entry ?? (criteria.selected !== undefined ? list.querySelector(".entry.selected") : null);
	const entries = listGetEntriesFiltered();
	return entry ? entries.indexOf(entry) : -1;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const panelInsert = (container: Element): HTMLElement => {
	const panel = document.createElement("div");
	panel.id = "action-select-panel";
	container.appendChild(panel);
	const list = document.createElement("div");
	list.classList.add("list");
	const input = document.createElement("div");
	input.classList.add("input");
	input.contentEditable = "true";
	input.spellcheck = false;
	input.addEventListener("keydown", event => {
		switch (event.key) {
		case "ArrowDown":
		case "ArrowUp": {
			const entrySelectedIdx = listGetEntryIndex({ selected: true });
			const entriesCount = listGetEntriesFiltered().length;
			listEntriesDeselect();
			listSelectNth((entriesCount + entrySelectedIdx + (event.key === "ArrowDown" ? 1 : -1)) % entriesCount);
			break;
		} case "Enter": {
			const entrySelected = Array.from(list.children).find(child => child.classList.contains("selected"));
			if (!entrySelected) {
				break;
			}
			entrySubmit(entrySelected);
			break;
		} case "Tab": {
			break;
		} default: {
			return;
		}}
		event.preventDefault();
	});
	input.addEventListener("input", () => {
		const inputText = input.textContent ?? "";
		if (!inputText.length) {
			listFilterEnd();
			listSelectNth(0);
			return;
		}
		listFilter(details =>
			inputText.toLowerCase().split(" ").every(text => details.key.includes(text) || details.name.includes(text))
		);
	});
	addEventListener("mousedown", event => {
		if (!(document.querySelector("#action-select-panel .list") as Element).contains(event.target as Element | null) ) {
			return;
		}
		const entry = (event.target as Element).closest(".entry") as Element;
		entrySubmit(entry);
		event.preventDefault();
	});
	panel.appendChild(input);
	panel.appendChild(list);
	input.focus();
	const loading = document.createTextNode("Awaiting API…");
	list.appendChild(loading);
	chrome.runtime.sendMessage({ type: "query" }, (apiQuery: APIQuery) => {
		if (!Object.keys(apiQuery).length) {
			return;
		}
		list.replaceChildren();
		getApiQueryKeys(apiQuery).forEach(key => {
			list.appendChild(entryCreate(key, "", apiQuery));
		});
		listSelectNth(0);
	});
	return panel;
};
