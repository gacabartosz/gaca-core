module.exports = {
  apps: [
    {
      name: 'gaca-core',
      script: 'npx',
      args: 'tsx src/api/server.ts',
      cwd: '/root/gaca-core',
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
      },
      max_memory_restart: '200M',
      error_file: './logs/gaca-error.log',
      out_file: './logs/gaca-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
};
