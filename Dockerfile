FROM php:8.2-cli

# Install PDO MySQL and curl extensions (needed for DB + Stripe)
RUN docker-php-ext-install pdo pdo_mysql \
    && apt-get update -y \
    && apt-get install -y libcurl4-openssl-dev \
    && docker-php-ext-install curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

# Railway injects $PORT at runtime; fall back to 8080 locally
CMD ["sh", "-c", "php -S 0.0.0.0:${PORT:-8080} -t public router.php"]
