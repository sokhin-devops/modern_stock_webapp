// Development only: /api goes to the Spring Boot API, so the browser sees one origin.
// That keeps the refresh-token cookie (HttpOnly, SameSite=Strict, path /api/v1/auth) working without CORS.
// The API prints its port at start-up; if it is not 8080, run: API_URL=http://localhost:8082 npm start
export default {
  '/api': {
    target: process.env.API_URL ?? 'http://localhost:8080',
    secure: false,
    changeOrigin: true,
  },
};
