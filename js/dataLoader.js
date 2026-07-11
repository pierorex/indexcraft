export async function loadIndex(name) {
  const file = name === 'nasdaq100' ? 'data/nasdaq100.json' : 'data/sp500.json';
  const res = await fetch(file);
  if (!res.ok) throw new Error(`Failed to load ${file}: ${res.status}`);
  return res.json();
}

export async function loadReturns() {
  const res = await fetch('data/returns.json');
  if (!res.ok) throw new Error(`Failed to load data/returns.json: ${res.status}`);
  return res.json();
}
