const fs = require('fs');
const content = fs.readFileSync('src/features/home/components/HeroSection/HeroSection.jsx', 'utf8');
const lines = content.split('\n');

const state = lines.slice(8, 317).join('\n');
const jsx = lines.slice(362, 712).join('\n');

const newComponent = `import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AIRPORTS } from '@/constants/airports';
import ScrollReveal from '@/components/ScrollReveal';

export default function SharedFlightSearchBar({ onSearchTriggered }) {
${state}
  return (
    <div className="shared-flight-search-bar w-full relative z-10">
${jsx}
    </div>
  );
}
`;

fs.mkdirSync('src/components/SharedFlightSearchBar', { recursive: true });
fs.writeFileSync('src/components/SharedFlightSearchBar/SharedFlightSearchBar.jsx', newComponent);
fs.writeFileSync('src/components/SharedFlightSearchBar/index.js', 'export { default } from \'./SharedFlightSearchBar\';');
console.log('Created SharedFlightSearchBar');
