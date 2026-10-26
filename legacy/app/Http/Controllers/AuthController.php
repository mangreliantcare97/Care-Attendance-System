<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;

use Mail;
use App\Mail\ForgotPasswordMail;

use Illuminate\Support\Str;

class AuthController extends Controller
{



    public function index(Request $request){
        return view('login');
    }

    public function forgot_password (Request $request){
        return view('forgot_password');
    }

    public function forgot_password_post (Request $request){

 //save in count variable = kho4 model user where condition email = ale el user d5lo ($request) --> 5odhom b2a 3edhom
 // naming convention help in it which when i say the name of model which mofrd and capital letter the table should not capital and gam3 when you make it (naming convention) it automatically access to table

$count = User::where('email', '=', $request->email)->count();

if($count > 0){ //e3ne lw la2t 7d f3ln

$user = User::where('email', '=', $request->email)->first();
$random_pass = rand(111111,999999);

$user->password = Hash::make($random_pass);
$user->save();

$user->random_pass = $random_pass;

Mail::to($user->email)->send(new ForgotPasswordMail($user) );

return redirect()->back()->with('success', 'Password has been send email');

}else{
    return redirect()->back()->with('error', 'Email Not Found');
}

    }




    public function register(Request $request){
        return view('register');
    }



    //function to save register in datebase with validation
    public function register_post(Request $request){

        $user = request()->validate([
            'name'               => 'required',
            'email'              => 'required|unique:users',
            'password'           => 'required|min:6',
            'confirm_password'   => 'required_with:password|same:password|min:6'
        ]);

        $user                   = new User;
        $user->name             = trim($request->name);
        $user->email            = trim($request->email);
        $user->password         = Hash::make($request->password);
        $user->remember_token   = Str::random(50);

        $user->save();

        return redirect('/')->with('success', 'Register successfully..');

    }


    public function login_post(Request $request){

if(Auth::attempt(['email' => $request->email, 'password' => $request->password ], true)){

    if(Auth::User()->is_role == '1'){
        return redirect()->intended('admin/dashboard');
    }else{
        return redirect('/')->with('error', 'No HR Availbles...');
    }

    }else{
        return redirect()->back()->with('errors', 'please enter a correct credentials');
    }
    }

    public function logout(){
        Auth::logout(); //to prevent enter from url after logout
        return redirect('/');
    }














}
