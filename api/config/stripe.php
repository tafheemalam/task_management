<?php
// Stripe API configuration
// Replace these with your actual Stripe keys from https://dashboard.stripe.com/apikeys
define('STRIPE_SECRET_KEY',       'sk_test_YOUR_STRIPE_SECRET_KEY');
define('STRIPE_PUBLISHABLE_KEY',  'pk_test_YOUR_STRIPE_PUBLISHABLE_KEY');

function stripePost(string $endpoint, array $data): array {
    $ch = curl_init('https://api.stripe.com/v1' . $endpoint);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query($data),
        CURLOPT_USERPWD        => STRIPE_SECRET_KEY . ':',
        CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded'],
    ]);
    $result = curl_exec($ch);
    curl_close($ch);
    return json_decode($result, true) ?? [];
}

function stripeGet(string $endpoint): array {
    $ch = curl_init('https://api.stripe.com/v1' . $endpoint);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_USERPWD        => STRIPE_SECRET_KEY . ':',
    ]);
    $result = curl_exec($ch);
    curl_close($ch);
    return json_decode($result, true) ?? [];
}
