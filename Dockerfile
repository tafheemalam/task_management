FROM php:8.2-cli

RUN docker-php-ext-install pdo pdo_mysql \
    && apt-get update -y \
    && apt-get install -y libcurl4-openssl-dev \
    && docker-php-ext-install curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

# Create startup script inside the image — avoids Windows CRLF issues entirely
RUN printf '#!/bin/sh\nexec php -S "0.0.0.0:${PORT:-8080}" -t /app/public /app/router.php\n' \
    > /start.sh && chmod +x /start.sh

EXPOSE 8080

CMD ["/start.sh"]
