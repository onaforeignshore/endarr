#!/bin/sh
set -e

# Run database migrations
echo "Running database migrations..."
alembic upgrade head

# Start Gunicorn
echo "Starting Endarr..."
exec gunicorn -b 0.0.0.0:7070 --workers 1 --timeout 30 app:app