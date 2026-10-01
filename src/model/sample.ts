export const SAMPLE_DBML = `Table users [headercolor: #2563eb] {
  id int [pk, increment]
  email varchar(255) [unique, not null]
  name varchar [not null]
  created_at timestamp [default: \`now()\`]

  Note: '注册用户'
}

Enum product_status {
  draft
  active
  archived
}

Table products {
  id int [pk, increment]
  name varchar [not null]
  price decimal(10,2) [not null]
  status product_status [not null, default: 'draft']
}

Table orders {
  id int [pk, increment]
  user_id int [not null, ref: > users.id]
  status varchar [not null]
  total decimal(10,2) [not null, default: 0]
  created_at timestamp

  indexes {
    (user_id, created_at) [name: 'orders_user_created']
  }

  Note: '订单'
}

Table order_items {
  id int [pk, increment]
  order_id int [not null, ref: > orders.id]
  product_id int [not null, ref: > products.id]
  quantity int [not null, default: 1]
  price decimal(10,2) [not null]
}
`
