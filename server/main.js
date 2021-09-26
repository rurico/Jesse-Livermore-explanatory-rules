const Fastify = require('fastify')
const fastify = Fastify({
    logger: true, keepAliveTimeout: 60 * 1000
})

fastify.register(require('fastify-cors'), {
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
    origin: true,
    maxAge: 60 * 60 * 4
})

fastify.register(require('fastify-http-proxy'), {
    upstream: 'http://api.waditu.com'
})

fastify.listen(4086, '0.0.0.0', err => { if (err) throw err })
