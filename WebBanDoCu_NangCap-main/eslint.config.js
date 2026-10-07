const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
    {
        ignores: ['node_modules/**', 'uploads/**'],
    },
    js.configs.recommended,
    {
        files: ['server.js', 'src/**/*.js'],
        languageOptions: {
            ecmaVersion: 2021,
            sourceType: 'commonjs',
            globals: globals.node,
        },
        rules: {
            'no-unused-vars': [
                'error',
                {
                    args: 'none',
                    caughtErrors: 'none',
                },
            ],
        },
    },
];
