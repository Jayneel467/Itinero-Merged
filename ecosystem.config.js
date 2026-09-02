module.exports = {
  apps: [
    {
      name: "itinero-supervisor",
      script: "python",
      args: "-m uvicorn supervisor.main:app --host 0.0.0.0 --port 8000",
      cwd: "./",
      watch: false,
      interpreter: "none",
      env: {
        APP_ENV: "production"
      }
    },
    {
      name: "itinero-vero",
      script: "python",
      args: "-m uvicorn general_agent.run:app --host 0.0.0.0 --port 8001",
      cwd: "./",
      watch: false,
      interpreter: "none",
      env: {
        APP_ENV: "production"
      }
    }
  ]
};
