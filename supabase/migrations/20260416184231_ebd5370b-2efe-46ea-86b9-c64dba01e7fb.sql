UPDATE public.subscribers
SET mrr = 45
WHERE stripe_subscription_id = 'sub_1TMuIPQXOqBVFUKWTL0PqMHJ'
  AND mrr <> 45;