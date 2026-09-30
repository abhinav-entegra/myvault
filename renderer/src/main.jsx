import React from "react";

import ReactDOM from "react-dom/client";

import App from "./App.jsx";

import "@fontsource-variable/fraunces";
import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/jetbrains-mono";

import "./index.css";

const root = document.getElementById("root");

ReactDOM.createRoot(root).render(

  <React.StrictMode>

    <App />

  </React.StrictMode>

);
