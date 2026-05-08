FROM php:8.2-cli

# Install PDO MySQL and curl extensions (needed for DB + Stripe)
RUN docker-php-ext-install pdo pdo_mysql \
    && apt-get update -y \
    && apt-get install -y libcurl4-openssl-dev \
    && docker-php-ext-install curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

COPY entrypoint.sh /entrypoint.sh
# Strip Windows CRLF line endings and make executable
RUN sed -i 's/\r//' /entrypoint.sh && chmod +x /entrypoint.sh

CMD ["/entrypoint.sh"]
