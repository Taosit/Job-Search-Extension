import { getStorage, setStorage } from "@src/shared/utils/storage";
import reloadOnUpdate from "virtual:reload-on-update-in-background-script";
import { produce } from "immer";

reloadOnUpdate("pages/background");

/**
 * Extension reloading is necessary because the browser automatically caches the css.
 * If you do not use the css of the content script, please delete it.
 */
reloadOnUpdate("pages/content/style.css");

console.log("background loaded");

chrome.runtime.onInstalled.addListener(() => {
  setStorage({
    applications: [],
    viewingApplicationId: null,
    urls: [{ id: 1, url: "https://www.linkedin.com/" }],
    applicationInProgress: null,
    currentTabs: [],
  });

  chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    setStorage({
      currentTabs: tabs.map((tab) => ({
        id: tab.id,
        toggleIsEnabled: false,
        toggleIsOn: false,
      })),
    });
  });

  chrome.contextMenus.create({
    id: "start-application",
    title: "Start Application",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  getStorage(["currentTabs"]).then((storage) => {
    setStorage({
      currentTabs: storage.currentTabs.map((currentTab) => {
        if (currentTab.id === tab.id) {
          return { ...currentTab, toggleIsOn: true };
        }
        return currentTab;
      }),
    });
  });
  if (info.menuItemId === "start-application") {
    chrome.tabs.sendMessage(tab.id, {
      event: "startApplication",
      data: {
        url: tab.url,
        title: info.selectionText,
      },
    });
    chrome.tabs.sendMessage(tab.id, {
      event: "openWindow",
      data: {
        page: 0,
      },
    });
    return;
  }
  if (info.menuItemId === "add-question") {
    chrome.tabs.sendMessage(tab.id, {
      event: "addQuestion",
      data: info.selectionText,
    });
    chrome.tabs.sendMessage(tab.id, {
      event: "openWindow",
      data: {
        page: 1,
      },
    });
    return;
  }
  if (info.menuItemId === "add-answer") {
    chrome.tabs.sendMessage(tab.id, {
      event: "addAnswer",
      data: info.selectionText,
    });
    chrome.tabs.sendMessage(tab.id, {
      event: "openWindow",
      data: {
        page: 1,
      },
    });
  }
});

// Keep track of tabs and their toggle status
chrome.tabs.onCreated.addListener((tab) => {
  getStorage(["currentTabs"]).then((storage) => {
    const tabAlreadyExists = storage.currentTabs.some(
      (currentTab) => currentTab.id === tab.id
    );
    if (tabAlreadyExists) return;
    setStorage({
      currentTabs: [
        ...storage.currentTabs,
        { id: tab.id, toggleIsEnabled: false, toggleIsOn: false },
      ],
    });
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  getStorage(["currentTabs"]).then((storage) => {
    setStorage({
      currentTabs: storage.currentTabs.filter((tab) => tab.id !== tabId),
    });
  });
});

// Update context menu based on applicationInProgress
chrome.runtime.onMessage.addListener(async (message: Message, sender) => {
  const { event, data } = message;
  if (event === "getTabId") {
    const tabId = sender.tab?.id;
    chrome.tabs.sendMessage(tabId, {
      event: "updateTab",
      data: tabId,
    });
    return;
  }
  if (event === "setApplicationInProgress") {
    const applicationInProgress = data;
    chrome.contextMenus.removeAll();
    if (
      !applicationInProgress ||
      (!applicationInProgress.company && !applicationInProgress.link)
    ) {
      chrome.contextMenus.create({
        id: "start-application",
        title: "Start Application",
        contexts: ["selection"],
      });
    } else {
      chrome.contextMenus.create({
        id: "add-question",
        title: "Add Question",
        contexts: ["selection"],
      });
      const incompleteQuestion =
        applicationInProgress.application.questions.find(
          (question) => !question.question || !question.answer
        );
      if (incompleteQuestion?.question) {
        chrome.contextMenus.create({
          id: "add-answer",
          title: "Add Answer",
          contexts: ["selection"],
        });
      }
    }
    return;
  }
  if (event === "completeApplication") {
    const { newApplication, tabId } = data;
    getStorage(["applications", "currentTabs", "urls"]).then(
      ({ applications, currentTabs }) => {
        const filteredQuestions = newApplication.application.questions.filter(
          (question) => question.question
        );
        const newApplicationWithFilteredQuestions = produce(
          newApplication,
          (draft) => {
            draft.application.questions = filteredQuestions;
          }
        );
        setStorage({
          applications: [...applications, newApplicationWithFilteredQuestions],
          currentTabs: currentTabs.map((currentTab) => {
            if (currentTab.id === tabId) {
              return { ...currentTab, toggleIsOn: false };
            }
            return currentTab;
          }),
        });
        setTimeout(() => {
          chrome.tabs.sendMessage(tabId, {
            event: "resetWindow",
            data: null,
          });
        }, 500);
      }
    );
    chrome.contextMenus.removeAll();
    chrome.contextMenus.create({
      id: "start-application",
      title: "Start Application",
      contexts: ["selection"],
    });
  }
});
