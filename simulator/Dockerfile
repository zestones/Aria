FROM python:3.12-alpine

WORKDIR /app

# asyncpg ships prebuilt wheels for musllinux on x86_64 — no compiler needed.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "-u", "main.py"]
