# Endarr Deployment

Endarr runs as a single Docker container. You can place it behind any reverse proxy (such as Traefik, nginx, Caddy) or expose it directly.

## Docker Compose Example

Multi-architecture Docker images (`linux/amd64` and `linux/arm64`) are published to GitHub Container Registry. Use the following setup

to pull the image:

```yaml
services:
    endarr:
        image: ghcr.io/onaforeignshore/endarr:latest
        container_name: endarr
        restart: unless-stopped
        ports:
            - '7070:7070'
        volumes:
            - /path/to/config.yaml:/app/config.yaml:ro
            - ./data/:/data
        environment:
            - LOG_LEVEL=INFO
            - LOG_COLOR=true
            - ENDARR_DATA_DIR=/data
```

> If you prefer to run Endarr behind a reverse proxy, configure it to forward traffic to port `7070`. Endarr does not require any special reverse-proxy settings.

## Configuration File (`config.yaml`)

Create a configuration file (you can start from the [config.sample.yaml](config.sample.yaml) provided in the repository).
The file can be placed anywhere; adjust the volume mount above to point to its actual location.

## Webhook Setup in \*Arr

In each \*Arr (Radarr, Sonarr, Lidarr), add a webhook:

- Name: `Endarr`
- URL: `http://endarr:7070/arr?apikey=your-secret-key`
- Events: `On Grab`, as well as `On Download` or `On File Import`

## Healthcheck

The container includes a healthcheck that polls `/health` every 30 seconds.

## Notes

- For production, generate a strong, unique `webhook_key`.
- Multiple download clients can be configured; each has its own watchdog.
- The multi-architecture image automatically selects the correct variant for your system.
