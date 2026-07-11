/**
 * Codifica una contraseña MySQL para usarla en DATABASE_URL.
 * Uso: node scripts/encode-db-password.js "tuContraseñaCon@#/"
 */
const password = process.argv[2];
if (!password) {
  console.error('Uso: node scripts/encode-db-password.js "tu_password"');
  process.exit(1);
}
console.log(encodeURIComponent(password));
