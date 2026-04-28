"use strict";

const { wipeBuffer } = require("./crypto");

let derivedKey = null;
let cachedEntries = [];
let cachedNotes = [];
let extensionToken = null;

function isUnlocked() {
  return derivedKey !== null;
}

function unlock(keyBuf) {
  lock();
  derivedKey = keyBuf;
}

function lock() {
  if (derivedKey) wipeBuffer(derivedKey);
  derivedKey = null;
  cachedEntries = [];
  cachedNotes = [];
  extensionToken = null;
}

function getDerivedKey() {
  return derivedKey;
}

function setCachedEntries(entries) {
  cachedEntries = entries;
}

function getCachedEntries() {
  return cachedEntries;
}

function setCachedNotes(notes) {
  cachedNotes = notes || [];
}

function getCachedNotes() {
  return cachedNotes;
}

function setExtensionToken(token) {
  extensionToken = token || null;
}

function getExtensionToken() {
  return extensionToken;
}

module.exports = {
  isUnlocked,
  unlock,
  lock,
  getDerivedKey,
  setCachedEntries,
  getCachedEntries,
  setCachedNotes,
  getCachedNotes,
  setExtensionToken,
  getExtensionToken,
};
