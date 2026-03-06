import React from 'react';
import { createRoot } from 'react-dom/client';
import 'maplibre-gl/dist/maplibre-gl.css';
import App from './App';

const root = createRoot(document.getElementById('root')!);
root.render(<App {...window.__INITIAL_DATA__} />);
