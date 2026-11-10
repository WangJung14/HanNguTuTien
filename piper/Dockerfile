FROM python:3.11-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PIPER_VOICE=zh_CN-huayan-medium

RUN pip install --no-cache-dir "piper-tts[http]" \
    && python -m piper.download_voices "${PIPER_VOICE}"

EXPOSE 10000

CMD ["sh", "-c", "python -m piper.http_server --host 0.0.0.0 --port \"${PORT:-10000}\" --model \"${PIPER_VOICE}\""]
