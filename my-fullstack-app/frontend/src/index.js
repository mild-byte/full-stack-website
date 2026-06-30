//Used to become the plugs the React component into the HTML file. It is the entry point of the React application.
import React from 'react';
import ReactDOM from 'react-dom';
import App from './App'; // Links to your App.js file

// The old Create React App way to mount the application
ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById('root')
);