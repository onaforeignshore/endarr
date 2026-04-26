FROM python:3.12-alpine

WORKDIR /app

# Install runtime dependencies (no build tools needed)
RUN apk add --no-cache tzdata

# Copy requirements first to leverage Docker cache
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the entire application
COPY . .

# Create volume mount points
VOLUME ["/data", "/app/config.yaml"]

# Expose port (Gunicorn will listen on this)
EXPOSE 7070

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:7070/health').read()"

COPY /entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT [ "/entrypoint.sh" ]
