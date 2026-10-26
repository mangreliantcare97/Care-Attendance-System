<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class MyAccountController extends Controller
{
    public function my_account(Request $request){
        $data['getRecord'] = User::find(Auth::user()->id);
        return view('backend.my-account.update',$data);


    }
    public function edit_update(Request $request){
        $use = request()->validate([
            'email' => 'required|unique:users,email,' .Auth::user()->id
        ]);

            $use = User::find(Auth::user()->id);
            $use->name               = trim ($request->name);
            $use->email              = trim ($request->email);

            if(!empty($request->password)){
            $use->password           = trim ($request->password);
            }

            $use->save();
return redirect('admin/my_account')->with('success', 'My Account Successfully Update!!');


    }
}
