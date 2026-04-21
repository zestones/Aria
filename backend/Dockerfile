FROM python:3.12-alpine

WORKDIR /app

# asyncpg + pyjwt + pydantic — all ship musllinux wheels.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
