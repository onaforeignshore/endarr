# Endarr

Torrent Lifecycle Manager for the \*Arr Ecosystem

## About

Endarr sits between your \*Arr suite (Radarr, Sonarr, Lidarr) and your download client. It tracks every torrent from grab to deletion, enforces your seeding-policy rules, handles upgrades, blocks malicious files, and gives you a clean dashboard to monitor everything.

Endarr runs as a single Docker container and works with any download client (qBittorrent, Transmission, Deluge, rTorrent, uTorrent, Flood).

> **⚠️ Important Notice**
>
> This project was created with the assistance of artificial intelligence (AI). While every effort has been made to ensure the code is functional and safe, you use this software **at your own risk**. If you do not agree with this development approach, or are not comfortable with AI‑generated code, please do not use Endarr.

## Features

- Tracks torrents from the moment they are grabbed until they are deleted
- Enforces flexible seeding policies – ratio, seed time, idle timeout, availability, upload amount
- Automatically handles upgrades when a better release is imported
- Detects and blocks dangerous file extensions (`.exe`, `.scr`, `.lnk`)
- Protects torrents you don’t want deleted (by tag, category, or tracker domain)
- Supports six download clients – not just qBittorrent
- WebUI dashboard for monitoring torrents, grabs, downloads, and blacklist
- Built‑in configuration validation and issue reporting

## Quick Start

**Prerequisites**

- A running \*Arr suite (Radarr, Sonarr, Lidarr) and a download client.
  They can be containers, native installs, or a mix – Endarr just needs to be able to reach them over the network.

**Docker Compose**

Create a `docker-compose.yml`:

```yaml
services:
    endarr:
        image: endarr:latest
        container_name: endarr
        restart: unless-stopped
        ports:
            - '7070:7070'
        volumes:
            - ./config.sample.yaml:/app/config.yaml:ro
            - ./data//:data
```

Start the container, then open the WebUI at `http://localhost:7070`.
On first run you’ll be shown a one‑click setup to generate your API key.

> If you run Endarr behind a reverse proxy (nginx, Traefik, Caddy, etc.), configure it to forward traffic to port `7070` — that’s all Endarr needs.

## Documentation

The full user guide is available on the **[GitHub Wiki](https://github.com/onaforeignshore/endarr/wiki)**.

## License

Endarr is licensed under the [GNU General Public License v3.0](LICENSE).
