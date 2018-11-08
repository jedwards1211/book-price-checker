#!/usr/bin/env node

const parse = require('csv-parse/lib/sync')
const stringify = require('csv-stringify/lib/sync')
const { readFile, writeFile } = require('fs-extra')
const throttle = require('@jcoreio/async-throttle')
const superagent = require('superagent')
const Throttle = require('superagent-throttle')

const eBayThrottle = new Throttle({
  active: true,
  rate: 5,
  ratePer: 1000,
  concurrent: 10,
})

const file = 'books.csv'

const token =
  'v^1.1#i^1#r^0#I^3#f^0#p^1#t^H4sIAAAAAAAAAOVXfWwURRTvtddqQymJfAlUcy5gjLp7s7f3ueEuuX5gT1p6crXyKc7uzpa1e7vHziztpSGcVYgGgxJNQBOTGtQoiQohaEKjJAZTSTCmYhAlkDQKCNrEGBExQdzdHuVaCVA4hMT75zJv3rz5/X7vvZkdkKuofHBD44azE113lPbmQK7U5WIngMqK8oeqy0pnlpeAAgdXb25Ozt1T9tM8DNNqhl+EcEbXMPJ0pVUN844xSpmGxusQK5jXYBphnoh8Kt7cxPsYwGcMneiirlKeRH2UCkvhSEAMiyLw+wURAsuqXYzZqkepSDDESQLkgAyRPyJZ0xibKKFhAjUSpXyADdMsS4NwK/DzHMf7gkwoElhKedqQgRVds1wYQMUctLyz1iiAemWkEGNkECsIFUvE56da4on6hoWt87wFsWJ5GVIEEhOPHtXpEvK0QdVEV94GO958yhRFhDHljQ3vMDooH78I5jrgO0r7AkjkIgFBCIBgOMT5iiLlfN1IQ3JlHLZFkWjZceWRRhSSvZqilhrC00gk+dFCK0Si3mP/PWZCVZEVZESphtr4kngyScUetfdskDrpWl3vSBqKSCcX1dOy6OM4wAZZOoJkwEmRUH6j4Wh5mcfsVKdrkmKLhj0LdVKLLNRorDa+Am0spxatxYjLxEZU6Bcc0RAstZM6nEWTrNLsvKK0JYTHGV49AyOrCTEUwSRoJMLYCUeiKAUzGUWixk46tZgvny4cpVYRkuG93s7OTqaTY3Sj3esDgPUubm5KiatQGlK2r93rjr9y9QW04lARkbUSKzzJZiwsXVatWgC0dirG+SOhkC+v+2hYsbHWfxkKOHtHd0SxOsSPIBdgOUGOCAEfEkPF6JBYvki9Ng4kwCydhkYHIhkViogWrToz08hQJJ4LyD4uLCNaCkZk2h+RZVoISEGalRECCAmCGAn/nxrlWks9JeoZlNRVRcwWp+CLVuyGlIQGyaaQqlqGa636y5LENsmbT8/u9fFQtGNgKwjMKIxd24yop706tA4127TSQX1DvOOZTCKdNgkUVJQo0oF2aw6zy9JTrOv+tuJk5W84kYo0fE8zTjYZvEZkDIR107A+UZgW+9pq1TuQZh0CxNBVFRlt7A0n+jbL7zjPyuvjXcSLepy8rV5nb2Zti6pildDKW8Tu1mZVgeT2Ys0G/GwwwAZB8IZ41Tk5bc3+F3fReOg16pgg6SZ8V3pHP3JjJc6P7XHtBj2undY7GXjBXHY2uK+i7HF3WdVMrBDEKFBmsNKuWY83AzEdKJuBilFa4VpWs+O9lQXP6t4V4O6Rh3VlGTuh4JUNai7NlLOTpk9kwywLwsDPcb7gUjD70qybneae0jAYfO7PT8+tbh+Y8eL62Q0zGptO94CJI04uV3mJu8dVssK9r+K35CnzieO1VZOWH/jl3JLdAeOT/i3beg8Ks97cfHLv/vcHvp47NGfjk7tWnD5zoaPv2QvVawfWt52vqX9ktdqyZ2vVLm59o/L2sdyRd+f93tf/anXim+0t94vPv3Hw12cqj/TV9od6t7Gvke7ufZOHlp15qsL90qm3Dnw2Cw5u+q7qiy0/f7yt7kDnxrqZZx/o2/nKEri2eXBS9beR3mB48b2Tt9/5+ZGvhrrXTH9n8G9XzdQJC9rNuviJGQvOv7Buz+v7w03s6UVM7vDR5Xul780Ppu5Ydwhu/eiYOe2ev+7aMHVgykmZpE+Uk6HNL5+vbTre/+GPg4f0P7TuH7Zv/LK5OT7/4aMU19N1eDh9/wDViT6J8BAAAA=='

let rowLength = 0
const INDEX = rowLength++
const ISBN = rowLength++
const TITLE = rowLength++
const DATE_CHECKED = rowLength++
const EBAY_PRICE = rowLength++

async function run() {
  const data =
    process.argv.indexOf('--reset') < 0
      ? parse(await readFile(file, 'utf8'))
      : []
  data[0] = []
  data[0][ISBN] = 'ISBN'
  data[0][DATE_CHECKED] = 'Date Checked'
  data[0][TITLE] = 'Title'
  data[0][EBAY_PRICE] = 'eBay Price'
  data[0][INDEX] = 'Index'
  data.forEach((row, index) => {
    if (row[INDEX] == null) row[INDEX] = index
    row.length = rowLength
  })
  const isbns = new Set(data.map(row => row[ISBN]))
  const writeLatest = throttle(async () => {
    await writeFile(file, stringify(data), 'utf8')
  }, 3000)

  function getTotalPrice({ price, shippingOptions }) {
    return parseFloat(price.value)
  }

  async function checkPrices(row) {
    const dateChecked = new Date(row[DATE_CHECKED])
    if (row[EBAY_PRICE] && Date.now() < dateChecked.getTime() + 86400000) return

    const {
      body: { itemSummaries },
    } = await superagent
      .get(`https://api.ebay.com/buy/browse/v1/item_summary/search`)
      .set('Authorization', `Bearer ${token}`)
      .type('json')
      .accept('json')
      .query({
        q: row[ISBN],
        limit: 10,
        sort: 'price',
      })
      .use(eBayThrottle.plugin())

    row[DATE_CHECKED] = new Date().toISOString()
    if (itemSummaries && itemSummaries.length) {
      row[TITLE] = itemSummaries[0].title
      const prices = itemSummaries
        .filter(s => s.price.currency === 'USD')
        .map(s => getTotalPrice(s))
        .sort((a, b) => b - a)

      row[EBAY_PRICE] = prices[prices.length >> 2]
      console.error(row) // eslint-disable-line no-console
      writeLatest()
    }
  }

  process.stdin.on('data', chunk => {
    const isbn = chunk.toString('utf8').trim()
    if (isbns.has(isbn)) {
      console.error('(already present)') // eslint-disable-line no-console
      return
    }
    isbns.add(isbn)
    console.error('(added)') // eslint-disable-line no-console
    const row = []
    row.length = rowLength
    row[ISBN] = isbn
    row[INDEX] = data.length
    data.push(row)
    checkPrices(row)
  })
  console.error('ready!') // eslint-disable-line no-console

  for (let i = 1; i < data.length; i++) {
    checkPrices(data[i])
  }

  process.on('SIGINT', async () => {
    await writeLatest()
    process.exit(0)
  })
}

run()
