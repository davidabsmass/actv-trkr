import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify the caller is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller }, error: authError } = await anonClient.auth.getUser();
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check caller is admin
    const { data: roleData } = await anonClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json();
    const { action } = body;

    if (action === "create_user") {
      const { email, password, full_name, org_id, role } = body;
      const normalizedEmail = String(email || "").trim().toLowerCase();
      const normalizedPassword = String(password || "");
      const normalizedFullName = String(full_name || "").trim();

      if (!normalizedEmail || !normalizedPassword || !org_id) {
        return new Response(JSON.stringify({ error: "email, password, and org_id are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (normalizedPassword.length < 6) {
        return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Enforce org-scoped admin permission
      const { data: callerOrgAccess, error: callerOrgAccessError } = await adminClient
        .from("org_users")
        .select("role")
        .eq("org_id", org_id)
        .eq("user_id", caller.id)
        .maybeSingle();

      if (callerOrgAccessError) {
        return new Response(JSON.stringify({ error: callerOrgAccessError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!callerOrgAccess || callerOrgAccess.role !== "admin") {
        return new Response(JSON.stringify({ error: "Org admin access required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Try to create user; if already exists, look them up and set the provided password
      let userId: string;

      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email: normalizedEmail,
        password: normalizedPassword,
        email_confirm: true,
        user_metadata: { full_name: normalizedFullName },
      });

      if (createError) {
        // If user already exists, find them, set the provided password, and add to org
        if (createError.message.includes("already been registered")) {
          const { data: { users }, error: listErr } = await adminClient.auth.admin.listUsers();
          if (listErr) {
            return new Response(JSON.stringify({ error: listErr.message }), {
              status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          const existing = users.find((u: any) => (u.email || "").toLowerCase() === normalizedEmail);
          if (!existing) {
            return new Response(JSON.stringify({ error: "User not found" }), {
              status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          const { error: pwErr } = await adminClient.auth.admin.updateUserById(existing.id, {
            password: normalizedPassword,
            email_confirm: true,
            user_metadata: { full_name: normalizedFullName },
          });

          if (pwErr) {
            return new Response(JSON.stringify({ error: pwErr.message }), {
              status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          userId = existing.id;
        } else {
          return new Response(JSON.stringify({ error: createError.message }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        userId = newUser.user.id;
      }

      // Add user to org (ignore if already a member)
      const { error: orgError } = await adminClient
        .from("org_users")
        .upsert({ org_id, user_id: userId, role: role || "member" }, { onConflict: "org_id,user_id", ignoreDuplicates: true });

      if (orgError) {
        return new Response(JSON.stringify({ error: orgError.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, user_id: userId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "reset_password") {
      const { email, new_password } = body;

      if (!email) {
        return new Response(JSON.stringify({ error: "email is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Look up user by email
      const { data: { users }, error: listError } = await adminClient.auth.admin.listUsers();
      if (listError) {
        return new Response(JSON.stringify({ error: listError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const targetUser = users.find((u: any) => u.email === email);
      if (!targetUser) {
        return new Response(JSON.stringify({ error: "User not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (new_password) {
        // Directly set password via admin API (no email needed)
        const { error: updateError } = await adminClient.auth.admin.updateUserById(targetUser.id, {
          password: new_password,
        });
        if (updateError) {
          return new Response(JSON.stringify({ error: updateError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ success: true, method: "password_set" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fallback: generate recovery link (admin can share it manually)
      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: "recovery",
        email,
      });
      if (linkError) {
        return new Response(JSON.stringify({ error: linkError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        method: "recovery_link",
        link: linkData?.properties?.action_link || null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete_user") {
      const { user_id: targetUserId } = body;
      if (!targetUserId) {
        return new Response(JSON.stringify({ error: "user_id is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Remove from all orgs first
      await adminClient.from("org_users").delete().eq("user_id", targetUserId);
      await adminClient.from("profiles").delete().eq("user_id", targetUserId);

      const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetUserId);
      if (deleteError) {
        return new Response(JSON.stringify({ error: deleteError.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
