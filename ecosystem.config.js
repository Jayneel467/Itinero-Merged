module.exports = {
  apps: [
    {
      name: "itinero-supervisor",
      script: "/home/itinero/public_html/itinero/backend/venv311/bin/python3.11",
      args: "-m uvicorn supervisor.main:app --host 0.0.0.0 --port 8000 --workers 2",
      cwd: "/home/itinero/public_html/itinero",
      watch: false,
      interpreter: "none",
      env: {
        APP_ENV: "sandbox"
      }
    },
    {
      name: "itinero-vero",
      script: "/home/itinero/public_html/itinero/backend/venv311/bin/python3.11",
      args: "-m uvicorn general_agent.run:app --host 0.0.0.0 --port 8001",
      cwd: "/home/itinero/public_html/itinero",
      watch: false,
      interpreter: "none",
      env: {
        APP_ENV: "sandbox",
        VERO_CHECKPOINT: "memory"
      }
    }

  ]
};

