import bcrypt from 'bcryptjs'

const password = 'Servitplus2026!'
const hash = bcrypt.hashSync(password, 10)

console.log('\n🔐 Password Hash Generator')
console.log('========================')
console.log('Password:', password)
console.log('Hash:', hash)
console.log('\nCopy this hash to use in SQL:')
console.log(hash)
