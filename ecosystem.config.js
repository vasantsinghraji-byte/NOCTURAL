/**
 * PM2 Ecosystem Configuration
 *
 * Production-grade process management with:
 * - Auto-restart on crash
 * - Cluster mode with load balancing
 * - Graceful shutdown and zero-downtime reloads
 * - Memory monitoring and auto-restart on leak
 * - Log rotation
 *
 * Usage:
 * - Development: pm2 start ecosystem.config.js --env development
 * - Production:  pm2 start ecosystem.config.js --env production
 * - Stop:        pm2 stop nocturnal-api
 * - Restart:     pm2 restart nocturnal-api
 * - Reload:      pm2 reload nocturnal-api (zero-downtime)
 * - Logs:        pm2 logs nocturnal-api
 * - Monitor:     pm2 monit
 */

module.exports = {
  apps: [
    {
      // Application Configuration
      name: 'nocturnal-api',
      script: './server.js',

      // Cluster Mode Configuration
      instances: process.env.NODE_ENV === 'production' ? 'max' : 1,
      exec_mode: 'cluster', // cluster mode for load balancing

      // Auto-restart Configuration
      autorestart: true,
      watch: false, // Set to true in development if you want auto-reload on file changes
      max_restarts: 10, // Max consecutive unstable restarts (1sec interval)
      min_uptime: '10s', // Min uptime before considered stable

      // Memory Management
      max_memory_restart: '500M', // Restart if memory usage exceeds 500MB

      // Graceful Shutdown
      kill_timeout: 5000, // Time to wait for graceful shutdown (5 seconds)
      wait_ready: true, // Wait for app to send 'ready' signal
      listen_timeout: 10000, // Time to wait for app to listen (10 seconds)
      shutdown_with_message: true, // Enable graceful shutdown with IPC messages

      // Process Management
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_file: './logs/pm2-combined.log',

      // Environment Variables - Development
      env: {
        NODE_ENV: 'development',
        PORT: 5000,
      },

      // Environment Variables - Production
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
      },

      // Advanced Features
      instance_var: 'INSTANCE_ID', // Inject instance ID as env variable

      // Monitoring
      pmx: true, // Enable PM2 monitoring

      // Source Map Support
      source_map_support: true,

      // Node.js Arguments
      node_args: [
        '--max-old-space-size=2048', // Max heap size 2GB
      ],

      // Cron Restart (optional - restart at specific time)
      // cron_restart: '0 0 * * *', // Restart every day at midnight

      // Exponential Backoff Restart Delay
      exp_backoff_restart_delay: 100, // Start with 100ms delay

      // Health Check (optional)
      // max_memory_restart: '500M',
      // min_uptime: '10s',
    },

    // Optional: Redis Server Management (if running Redis locally)
    // {
    //   name: 'redis',
    //   script: 'redis-server',
    //   instances: 1,
    //   exec_mode: 'fork',
    //   autorestart: true,
    // },

    // Optional: MongoDB Server Management (if running MongoDB locally)
    // {
    //   name: 'mongodb',
    //   script: 'mongod',
    //   args: '--dbpath ./data/db',
    //   instances: 1,
    //   exec_mode: 'fork',
    //   autorestart: true,
    // },
  ],

  // Deployment Configuration (optional)
  deploy: {
    production: {
      user: 'deploy',
      host: ['your-server.com'],
      ref: 'origin/main',
      repo: 'git@github.com:username/nocturnal.git',
      path: '/var/www/nocturnal',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': 'apt-get install git -y',
      'post-setup': 'npm install',
      ssh_options: 'StrictHostKeyChecking=no',
    },

    staging: {
      user: 'deploy',
      host: ['staging-server.com'],
      ref: 'origin/develop',
      repo: 'git@github.com:username/nocturnal.git',
      path: '/var/www/nocturnal-staging',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env staging',
    },
  },
};
