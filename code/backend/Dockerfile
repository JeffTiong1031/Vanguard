FROM python:3.11-slim

WORKDIR /app
COPY pyproject.toml ./
RUN pip install --no-cache-dir "fastapi>=0.115" "uvicorn[standard]>=0.30" \
    "python-multipart>=0.0.9" "pypdf>=5.0" "pymupdf>=1.24"

COPY app ./app

# No volume mounts for uploads. Nothing is written to this filesystem by the
# request path, and there is nowhere for it to persist if it were (F4).
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --no-access-log"]
