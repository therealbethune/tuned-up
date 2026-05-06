const { spawn } = require('child_process');

const server = spawn('npm', ['run', 'dev'], {
  env: { ...process.env, NETLIFY_DATABASE_URL: 'postgres://dummy:dummy@localhost:5432/dummy' },
});

server.stdout.on('data', (data) => {
  if (data.toString().includes('Ready in')) {
    console.log('Server started, sending request...');
    fetch('http://localhost:3000/api/ratings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        song: { id: "yt:123", title: "Test", artist: "Artist" },
        score: 50,
        review: "Good"
      })
    })
    .then(r => r.json())
    .then(console.log)
    .catch(console.error)
    .finally(() => server.kill());
  }
});
server.stderr.on('data', (data) => console.error(data.toString()));
