(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-HASH u101)
(define-constant ERR-INVALID-TITLE u102)
(define-constant ERR-INVALID-DESCRIPTION u103)
(define-constant ERR-INVALID-CATEGORY u104)
(define-constant ERR-INVALID-TAGS u105)
(define-constant ERR-INVALID-PRICE u106)
(define-constant ERR-INVALID-ROYALTY-RATE u107)
(define-constant ERR-INVALID-TIMESTAMP u108)
(define-constant ERR-AUTHORITY-NOT-VERIFIED u109)
(define-constant ERR-CONTENT-ALREADY-EXISTS u110)
(define-constant ERR-CONTENT-NOT-FOUND u111)
(define-constant ERR-MAX-CONTENTS-EXCEEDED u112)
(define-constant ERR-INVALID-UPDATE-PARAM u113)
(define-constant ERR-UPDATE-NOT-ALLOWED u114)
(define-constant ERR-INVALID-MAX-CONTENTS u115)
(define-constant ERR-INVALID-REGISTRATION-FEE u116)
(define-constant ERR-INVALID-PRINCIPAL u117)
(define-constant ERR-TAG-TOO-LONG u118)
(define-constant ERR-TOO-MANY-TAGS u119)
(define-constant ERR-INVALID-CURRENCY u120)

(define-data-var next-content-id uint u0)
(define-data-var max-contents uint u100000)
(define-data-var registration-fee uint u100)
(define-data-var authority-contract (optional principal) none)

(define-map contents
  uint
  {
    hash: (buff 32),
    title: (string-utf8 256),
    description: (string-utf8 1024),
    creator: principal,
    timestamp: uint,
    category: (string-utf8 50),
    tags: (list 10 (string-utf8 50)),
    price: uint,
    royalty-rate: uint,
    currency: (string-utf8 20),
    status: bool
  }
)

(define-map contents-by-hash
  (buff 32)
  uint)

(define-map content-updates
  uint
  {
    update-title: (string-utf8 256),
    update-description: (string-utf8 1024),
    update-timestamp: uint,
    updater: principal
  }
)

(define-read-only (get-content (id uint))
  (map-get? contents id)
)

(define-read-only (get-content-by-hash (hash (buff 32)))
  (match (map-get? contents-by-hash hash)
    content-id (get-content content-id)
    none
  )
)

(define-read-only (get-content-updates (id uint))
  (map-get? content-updates id)
)

(define-read-only (is-content-registered (hash (buff 32)))
  (is-some (map-get? contents-by-hash hash))
)

(define-private (validate-hash (hash (buff 32)))
  (if (is-eq (len hash) u32)
      (ok true)
      (err ERR-INVALID-HASH))
)

(define-private (validate-title (title (string-utf8 256)))
  (if (and (> (len title) u0) (<= (len title) u256))
      (ok true)
      (err ERR-INVALID-TITLE))
)

(define-private (validate-description (desc (string-utf8 1024)))
  (if (<= (len desc) u1024)
      (ok true)
      (err ERR-INVALID-DESCRIPTION))
)

(define-private (validate-category (cat (string-utf8 50)))
  (if (and (> (len cat) u0) (<= (len cat) u50))
      (ok true)
      (err ERR-INVALID-CATEGORY))
)

(define-private (validate-tags (tags (list 10 (string-utf8 50))))
  (if (<= (len tags) u10)
      (fold validate-tag tags (ok true))
      (err ERR-TOO-MANY-TAGS))
)

(define-private (validate-tag (tag (string-utf8 50)) (acc (response bool uint)))
  (match acc
    ok-val (if (<= (len tag) u50)
               (ok true)
               (err ERR-TAG-TOO-LONG))
    err-val acc
  )
)

(define-private (validate-price (price uint))
  (if (>= price u0)
      (ok true)
      (err ERR-INVALID-PRICE))
)

(define-private (validate-royalty-rate (rate uint))
  (if (<= rate u100)
      (ok true)
      (err ERR-INVALID-ROYALTY-RATE))
)

(define-private (validate-currency (cur (string-utf8 20)))
  (if (or (is-eq cur u"STX") (is-eq cur u"USD") (is-eq cur u"BTC"))
      (ok true)
      (err ERR-INVALID-CURRENCY))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-INVALID-PRINCIPAL))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-principal contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-max-contents (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-INVALID-MAX-CONTENTS))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set max-contents new-max)
    (ok true)
  )
)

(define-public (set-registration-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR-INVALID-REGISTRATION-FEE))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set registration-fee new-fee)
    (ok true)
  )
)

(define-public (register-content
  (hash (buff 32))
  (title (string-utf8 256))
  (description (string-utf8 1024))
  (category (string-utf8 50))
  (tags (list 10 (string-utf8 50)))
  (price uint)
  (royalty-rate uint)
  (currency (string-utf8 20))
)
  (let (
        (next-id (var-get next-content-id))
        (current-max (var-get max-contents))
        (authority (var-get authority-contract))
      )
    (asserts! (< next-id current-max) (err ERR-MAX-CONTENTS-EXCEEDED))
    (try! (validate-hash hash))
    (try! (validate-title title))
    (try! (validate-description description))
    (try! (validate-category category))
    (try! (validate-tags tags))
    (try! (validate-price price))
    (try! (validate-royalty-rate royalty-rate))
    (try! (validate-currency currency))
    (asserts! (is-none (map-get? contents-by-hash hash)) (err ERR-CONTENT-ALREADY-EXISTS))
    (let ((authority-recipient (unwrap! authority (err ERR-AUTHORITY-NOT-VERIFIED))))
      (try! (stx-transfer? (var-get registration-fee) tx-sender authority-recipient))
    )
    (map-set contents next-id
      {
        hash: hash,
        title: title,
        description: description,
        creator: tx-sender,
        timestamp: block-height,
        category: category,
        tags: tags,
        price: price,
        royalty-rate: royalty-rate,
        currency: currency,
        status: true
      }
    )
    (map-set contents-by-hash hash next-id)
    (var-set next-content-id (+ next-id u1))
    (print { event: "content-registered", id: next-id })
    (ok next-id)
  )
)

(define-public (update-content
  (content-id uint)
  (update-title (string-utf8 256))
  (update-description (string-utf8 1024))
)
  (let ((content (map-get? contents content-id)))
    (match content
      c
        (begin
          (asserts! (is-eq (get creator c) tx-sender) (err ERR-NOT-AUTHORIZED))
          (try! (validate-title update-title))
          (try! (validate-description update-description))
          (map-set contents content-id
            (merge c {
              title: update-title,
              description: update-description,
              timestamp: block-height
            })
          )
          (map-set content-updates content-id
            {
              update-title: update-title,
              update-description: update-description,
              update-timestamp: block-height,
              updater: tx-sender
            }
          )
          (print { event: "content-updated", id: content-id })
          (ok true)
        )
      (err ERR-CONTENT-NOT-FOUND)
    )
  )
)

(define-public (get-content-count)
  (ok (var-get next-content-id))
)

(define-public (verify-ownership (hash (buff 32)) (claimed-creator principal))
  (match (map-get? contents-by-hash hash)
    id
      (let ((content (unwrap-panic (get-content id))))
        (ok (is-eq (get creator content) claimed-creator))
      )
    (ok false)
  )
)